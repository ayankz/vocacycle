const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');

function setup(load) {
  const timers = new Map();
  let next = 0;
  let state;
  const context = {
    exports: {}, AbortController, Error,
    setTimeout(fn, delay) { const id = ++next; timers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  const source = fs.readFileSync('src/features/home/data/recent-words-controller.ts', 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  const controller = new context.exports.RecentWordsController(load, value => { state = value; });
  return {
    controller, timers, get state() { return state; },
    async flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); },
    async tick(delay = 2000) {
      const entry = [...timers].find(([, timer]) => timer.delay === delay);
      assert.ok(entry, `Expected a ${delay}ms timer`);
      timers.delete(entry[0]); entry[1].fn(); await this.flush();
    },
  };
}
const word = (id, translation = null) => ({ id, text: `word${id}`, translation });

test('only new words poll; translation success cancels the timer', async () => {
  let words = [word(1)]; let calls = 0;
  const s = setup(async () => { calls++; return words; });
  s.controller.focus(); await s.flush();
  assert.equal(s.timers.size, 0);
  s.controller.added(word(2)); words = [word(1), word(2)]; await s.flush();
  assert.equal(s.state.attempts.get(2), 0);
  assert.equal(s.state.words[0].id, 2);
  words = [word(1), word(2, 'слово')];
  await s.tick();
  assert.equal(s.state.words[0].translation, 'слово');
  assert.equal(s.state.attempts.size, 0);
  assert.equal(s.timers.size, 0);
  assert.equal(calls, 3);
});

test('five failed polls exhaust the budget and preserve the list', async () => {
  let fail = false; let calls = 0;
  const s = setup(async () => { calls++; if (fail) throw Error('offline'); return [word(1)]; });
  s.controller.focus(); await s.flush();
  s.controller.added(word(1)); await s.flush(); fail = true;
  for (let i = 0; i < 5; i++) await s.tick();
  assert.equal(s.state.attempts.get(1), 5);
  assert.equal(s.state.words.length, 1);
  assert.equal(s.state.loading, false);
  assert.equal(s.state.error, 'offline');
  assert.equal(s.timers.size, 0);
  assert.equal(calls, 7);
});

test('rapid additions serialize requests and share one polling timer', async () => {
  let resolve; let calls = 0; let inflight = 0; let max = 0;
  const s = setup(() => {
    calls++; max = Math.max(max, ++inflight);
    return new Promise(r => { resolve = words => { inflight--; r(words); }; });
  });
  s.controller.focus();
  s.controller.added(word(1)); s.controller.added(word(2));
  assert.equal(calls, 1);
  resolve([]); await s.flush();
  assert.equal(s.state.words.length, 2);
  assert.equal(calls, 2);
  resolve([word(1), word(2)]); await s.flush();
  assert.equal(s.timers.size, 1);
  assert.equal(max, 1);
  const polling = s.tick();
  resolve([word(1), word(2)]); await polling;
  assert.equal(s.state.attempts.get(1), 1);
  assert.equal(s.state.attempts.get(2), 1);
  s.controller.blur(); assert.equal(s.timers.size, 0);
});

test('blur aborts requests, ignores stale results, and focus refreshes completed translations', async () => {
  let resolve; let signal;
  const s = setup(abortSignal => { signal = abortSignal; return new Promise(r => { resolve = r; }); });
  s.controller.focus(); s.controller.added(word(1));
  s.controller.blur(); assert.equal(signal.aborted, true);
  s.controller.focus(); resolve([word(1, 'stale')]); await s.flush();
  assert.equal(s.state.words[0].translation, null);
  resolve([word(1, 'слово')]); await s.flush();
  assert.equal(s.state.words[0].translation, 'слово');
  assert.equal(s.timers.size, 0);
});

test('timeouts count toward the five attempt limit', async () => {
  let stall = false;
  const s = setup(signal => stall
    ? new Promise((_, reject) => signal.addEventListener('abort', () => reject(Error('aborted'))))
    : Promise.resolve([word(1)]));
  s.controller.focus(); await s.flush(); s.controller.added(word(1)); await s.flush(); stall = true;
  for (let i = 0; i < 5; i++) { await s.tick(); await s.tick(8000); }
  assert.equal(s.state.attempts.get(1), 5);
  assert.equal(s.timers.size, 0);
});

test('returning Home refreshes exhausted words without restarting polling', async () => {
  let translated = false;
  const s = setup(async () => [word(1, translated ? 'слово' : null)]);
  s.controller.focus(); await s.flush(); s.controller.added(word(1)); await s.flush();
  for (let i = 0; i < 5; i++) await s.tick();
  s.controller.blur(); translated = true; s.controller.focus(); await s.flush();
  assert.equal(s.state.words[0].translation, 'слово');
  assert.equal(s.timers.size, 0);
});

test('a later addition gets its own budget without resetting an older word', async () => {
  const words = [word(1)];
  const s = setup(async () => [...words]);
  s.controller.focus(); await s.flush(); s.controller.added(word(1)); await s.flush();
  for (let i = 0; i < 4; i++) await s.tick();
  words.push(word(2)); s.controller.added(word(2)); await s.flush();
  await s.tick();
  assert.equal(s.state.attempts.get(1), 5);
  assert.equal(s.state.attempts.get(2), 1);
  for (let i = 0; i < 4; i++) await s.tick();
  assert.equal(s.state.attempts.get(1), 5);
  assert.equal(s.state.attempts.get(2), 5);
  assert.equal(s.timers.size, 0);
});

test('blur clears the polling timer and late requests cannot restart it', async () => {
  let resolve;
  const s = setup(async () => [word(1)]);
  s.controller.focus(); await s.flush(); s.controller.added(word(1)); await s.flush();
  assert.equal(s.timers.size, 1);
  s.controller.blur(); assert.equal(s.timers.size, 0);

  const inFlight = setup(() => new Promise(r => { resolve = r; }));
  inFlight.controller.focus(); inFlight.controller.added(word(2));
  inFlight.controller.blur(); resolve([word(2, 'late')]); await inFlight.flush();
  assert.equal(inFlight.timers.size, 0);
  assert.equal(inFlight.state.words[0].translation, null);
});
