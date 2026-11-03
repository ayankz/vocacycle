const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./helpers/load-ts.cjs');
const settings = { wordIds: [27], examplesPerWord: 5, includeWordTranslation: true, includeExampleTranslations: false };
function setup(create) {
  const slots = [], notifications = [], ids = [], timers = new Map(); let cursor = 0, focus, key = 0, timerId = 0;
  const loader = createLoader({
    react: {
      useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], v => { slots[i] = v; notifications.push(v); }]; },
      useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; }, useCallback: fn => fn,
    },
    'expo-router': { useFocusEffect: fn => { focus = fn; } },
    '../data/audio-sessions-api': { createAudioSession: create, newRequestId: () => `request-${++key}` },
  }, { AbortController, setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); } });
  const useCreate = loader('src/features/audio/hooks/use-create-session.ts').useCreateSession;
  const render = () => { cursor = 0; return useCreate(id => ids.push(id)); };
  render(); const cleanup = focus();
  return { render, cleanup, refocus: () => focus(), ids, notifications, timers };
}
test('rapid Generate taps issue one POST; failed/uncertain retries keep the same idempotency key', async () => {
  const requests = []; let reject;
  const s = setup((request) => { requests.push(request); return new Promise((_, no) => { reject = no; }); });
  const hook = s.render(); const first = hook.generate(settings); await hook.generate(settings);
  assert.equal(requests.length, 1); reject(Error('offline')); await first;
  const retry = s.render().generate(settings); assert.equal(requests[1].requestId, requests[0].requestId); reject(Error('offline')); await retry;
  const changed = s.render().generate({ ...settings, examplesPerWord: 6 }); assert.notEqual(requests[2].requestId, requests[1].requestId); reject(Error('offline')); await changed;
});
test('timeout/unmount release loading and ignore late create responses without a second POST', async () => {
  let resolve, signal; const s = setup((request, s) => { signal = s; return new Promise(r => { resolve = r; }); });
  const pending = s.render().generate(settings); [...s.timers.values()][0](); await pending;
  assert.equal(signal.aborted, true); assert.equal(s.render().busy, false); assert.match(s.render().error, /confirm/);
  const second = s.render().generate(settings); s.cleanup(); await second; const size = s.notifications.length;
  resolve({ id: 7 }); await Promise.resolve(); assert.equal(s.notifications.length, size); assert.deepEqual(s.ids, []);
  s.refocus(); assert.equal(s.render().busy, false);
});
test('successful creation hands off only the real session ID', async () => {
  const s = setup(async () => ({ id: 42 })); await s.render().generate(settings);
  assert.deepEqual(s.ids, [42]); assert.equal(s.render().busy, false);
});
