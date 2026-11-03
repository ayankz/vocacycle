const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./helpers/load-ts.cjs');
const word = { id: 27, text: 'bike', translation: 'велосипед', ipa: null, pronunciationAudioUrl: '/words/27/pronunciation' };

function setup({ journal = { value: null }, remove, store: overrides = {} } = {}) {
  let now = 0, serial = 0, state;
  const timers = new Map(), calls = [], removed = [], restored = [], updates = [];
  const store = {
    async read() { return journal.value; },
    async write(value) { journal.value = value; }, ...overrides,
  };
  const { WordDeletionController } = createLoader({}, {
    AbortController,
    setTimeout(fn, delay) { const id = ++serial; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  })('src/features/home/data/word-deletion-controller.ts');
  const controller = new WordDeletionController(store, (id, signal) => {
    calls.push({ id, signal }); return remove ? remove(id, signal) : Promise.resolve();
  }, value => { state = value; updates.push(value); }, id => removed.push(id), value => restored.push(value), () => now);
  const s = { controller, journal, calls, removed, restored, timers, updates, get state() { return state; },
    async flush() { for (let i = 0; i < 20; i++) await Promise.resolve(); },
    async start() { controller.start(); await this.flush(); },
    async advance(ms) {
      now += ms;
      for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); }
      await this.flush();
    },
  };
  return s;
}

test('persist deletion before hiding; reject another deletion during the full five-second Undo window', async () => {
  let persist;
  const s = setup({ store: { write: value => new Promise(resolve => { persist = () => { s.journal.value = value; resolve(); }; }) } });
  await s.start(); const deletion = s.controller.delete(word);
  assert.equal(s.state.pending, null); assert.equal(s.state.busy, true);
  assert.equal(await s.controller.delete({ ...word, id: 28 }), false);
  persist(); assert.equal(await deletion, true);
  assert.equal(s.state.pending.word.id, 27); assert.equal(s.state.undoAvailable, true);
  await s.advance(4999); assert.equal(s.calls.length, 0);
  assert.equal(await s.controller.delete({ ...word, id: 28 }), false);
  s.controller.stop();
});

test('Undo restores the same word and audio without DELETE, Add or regeneration', async () => {
  const s = setup(); await s.start(); await s.controller.delete(word); await s.advance(4900);
  await s.controller.undo(); await s.advance(1000);
  assert.equal(s.journal.value, null); assert.equal(s.state.pending, null); assert.equal(s.calls.length, 0);
  assert.equal(s.restored[0], word); assert.equal(s.restored[0].pronunciationAudioUrl, '/words/27/pronunciation');
  assert.equal(s.timers.size, 0);
});

test('after five seconds commit DELETE once, then clear journal and vocabulary record', async () => {
  let complete;
  const s = setup({ remove: () => new Promise(resolve => { complete = resolve; }) });
  await s.start(); await s.controller.delete(word); await s.advance(5000);
  assert.equal(s.calls.length, 1); assert.equal(s.calls[0].id, 27);
  assert.equal(s.state.undoAvailable, false); assert.equal(s.state.busy, true);
  await s.controller.undo(); assert.ok(s.journal.value);
  complete(); await s.flush();
  assert.equal(s.journal.value, null); assert.equal(s.state.pending, null); assert.equal(s.removed[0], 27);
});

test('closing/backgrounding preserves the journal and restart reconciles an expired deadline', async () => {
  const journal = { value: null };
  const first = setup({ journal }); await first.start(); await first.controller.delete(word); first.controller.stop();
  await first.advance(10000); assert.equal(first.calls.length, 0);
  const restarted = setup({ journal }); await restarted.advance(10000); await restarted.start();
  assert.equal(restarted.calls.length, 1); assert.equal(journal.value, null); assert.equal(restarted.removed[0], 27);
});

test('reopening before the deadline preserves the remaining Undo period', async () => {
  const journal = { value: { word, undoUntil: 5000 } };
  const s = setup({ journal }); await s.advance(3000); await s.start();
  assert.equal(s.state.undoAvailable, true); assert.equal(s.calls.length, 0);
  await s.controller.undo(); assert.equal(journal.value, null); assert.equal(s.restored.length, 1);
});

test('confirmed API rejection restores the word, clears intent and reports an error', async () => {
  const s = setup({ remove: async () => { throw Object.assign(new Error('503'), { confirmedKept: true }); } });
  await s.start(); await s.controller.delete(word); await s.advance(5000);
  assert.equal(s.state.pending, null); assert.equal(s.journal.value, null); assert.equal(s.restored[0], word);
  assert.match(s.state.error, /restored/);
  await s.controller.retry(); assert.equal(s.state.error, null);
});

test('uncertain DELETE result retains intent, does not falsely restore, and retries on manual refresh', async () => {
  let fail = true;
  const s = setup({ remove: async () => { if (fail) throw Error('network lost'); } });
  await s.start(); await s.controller.delete(word); await s.advance(5000);
  assert.ok(s.journal.value); assert.equal(s.restored.length, 0); assert.match(s.state.error, /confirm/);
  assert.equal(s.timers.size, 0); fail = false; await s.controller.retry();
  assert.equal(s.calls.length, 2); assert.equal(s.journal.value, null);
});

test('a stalled request times out without losing its durable intent', async () => {
  const s = setup({ remove: () => new Promise(() => {}) });
  await s.start(); await s.controller.delete(word); await s.advance(5000); await s.advance(8000);
  assert.equal(s.calls[0].signal.aborted, true); assert.equal(s.state.busy, false);
  assert.ok(s.journal.value); assert.equal(s.restored.length, 0); assert.equal(s.timers.size, 0);
});

test('foreground recovery retries an interrupted request; stale transport completion cannot clear the new intent', async () => {
  const completions = [];
  const s = setup({ remove: () => new Promise(resolve => completions.push(resolve)) });
  await s.start(); await s.controller.delete(word); await s.advance(5000);
  s.controller.stop(); s.controller.start(); await s.flush();
  assert.equal(s.calls[0].signal.aborted, true); assert.equal(s.calls.length, 2);
  completions[0](); await s.flush(); assert.ok(s.journal.value); assert.equal(s.state.busy, true);
  completions[1](); await s.flush(); assert.equal(s.journal.value, null);
});

test('storage failure prevents deletion and no notification is emitted after unmount', async () => {
  const s = setup({ store: { async write() { throw Error('disk full'); } } });
  await s.start(); assert.equal(await s.controller.delete(word), false);
  assert.equal(s.state.pending, null); assert.match(s.state.error, /not been removed/); assert.equal(s.calls.length, 0);
  const count = s.updates.length; s.controller.stop(); await s.advance(10000);
  assert.equal(s.updates.length, count);
});
