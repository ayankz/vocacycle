const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./helpers/load-ts.cjs');
const session = status => ({ id: 7, status, stage: status, error: null });
function setup(load) {
  let now = 0, next = 0; const timers = new Map(), states = [];
  const { SessionStatusController } = createLoader({}, {
    AbortController, Date: { now: () => now },
    setTimeout(fn, delay) { timers.set(++next, { fn, delay }); return next; }, clearTimeout(id) { timers.delete(id); },
  })('src/features/audio/data/session-status-controller.ts');
  const controller = new SessionStatusController(7, load, state => states.push(state));
  const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  return { controller, timers, states, flush, get state() { return states.at(-1); }, setNow: value => { now = value; },
    async tick(delay) { const item = [...timers].find(([, t]) => t.delay === delay); assert.ok(item, `timer ${delay}`); timers.delete(item[0]); item[1].fn(); await flush(); } };
}
test('real pending → processing → Ready statuses poll serially and terminal status stops polling', async () => {
  const results = ['pending', 'processing', 'ready']; let calls = 0;
  const s = setup(async id => { assert.equal(id, 7); return session(results[calls++]); });
  s.controller.focus(); await s.flush(); assert.equal(s.state.session.status, 'pending');
  await s.tick(3000); assert.equal(s.state.session.status, 'processing');
  await s.tick(3000); assert.equal(s.state.session.status, 'ready'); assert.equal(s.timers.size, 0);
});
test('failure and network errors are distinct, and Check status can recover', async () => {
  let fail = true; const s = setup(async () => { if (fail) throw Error('offline'); return session('failed'); });
  s.controller.focus(); await s.flush(); assert.equal(s.state.session, null); assert.equal(s.state.paused, true); assert.equal(s.state.loading, false);
  fail = false; await s.controller.refresh(); assert.equal(s.state.session.status, 'failed'); assert.equal(s.timers.size, 0);
});
test('blur aborts in-flight requests; late responses cannot overwrite refocus or update after unmount', async () => {
  let resolve, signal, calls = 0;
  const s = setup((id, requestSignal) => { calls++; signal = requestSignal; return calls === 1 ? new Promise(r => { resolve = r; }) : Promise.resolve(session('ready')); });
  s.controller.focus(); s.controller.blur(); assert.equal(signal.aborted, true);
  s.controller.focus(); await s.flush(); const size = s.states.length;
  resolve(session('pending')); await s.flush(); assert.equal(s.states.length, size); assert.equal(s.state.session.status, 'ready');
  s.controller.blur(); resolve(session('processing')); await s.flush(); assert.equal(s.states.length, size);
});
test('stalled status request times out and late transport results are ignored', async () => {
  let resolve; const s = setup(() => new Promise(r => { resolve = r; }));
  s.controller.focus(); await s.tick(10000);
  assert.equal(s.state.loading, false); assert.equal(s.state.paused, true); const size = s.states.length;
  resolve(session('ready')); await s.flush(); assert.equal(s.states.length, size);
});
test('bounded polling pauses without inventing a backend failure', async () => {
  const s = setup(async () => session('processing'));
  s.controller.focus(); await s.flush(); s.setNow(30 * 60000 + 1); await s.tick(3000);
  assert.equal(s.state.session.status, 'processing'); assert.equal(s.state.paused, true); assert.equal(s.timers.size, 0);
});
test('wrong session IDs are rejected rather than rendering unrelated readiness', async () => {
  const s = setup(async () => ({ ...session('ready'), id: 9 })); s.controller.focus(); await s.flush();
  assert.equal(s.state.session, null); assert.match(s.state.error, /Unexpected/);
});
