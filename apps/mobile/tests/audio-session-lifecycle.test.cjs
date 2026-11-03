const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./helpers/load-ts.cjs');

test('session playback uses the existing iPhone controller, remains foreground-only and cleans up on navigation', () => {
  let effect, listener, plays = 0, stops = 0, removed = 0, prepared;
  const state = { currentState: 'active', addEventListener: (event, fn) => { listener = fn; return { remove() { removed++; } }; } };
  const hook = createLoader({
    react: { useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}], useRef: value => ({ current: value }), useCallback: fn => fn },
    'react-native': { AppState: state, Alert: { alert() {} } },
    'expo-router': { useFocusEffect: fn => { effect = fn; } },
    'expo-audio': { createAudioPlayer() {}, setAudioModeAsync: options => { prepared = options; } },
    '@/features/home/data/pronunciation-controller': { PronunciationController: class {
      constructor(create, prepare) { this.prepare = prepare; }
      play = word => { plays++; assert.equal(word.pronunciationAudioUrl, '/audio-sessions/7/audio'); this.prepare(); };
      stop = () => { stops++; };
    } },
  })('src/features/audio/hooks/use-session-playback.ts').useSessionPlayback();
  const cleanup = effect(); hook.play(7, '/audio-sessions/7/audio');
  assert.equal(plays, 1); assert.equal(prepared.shouldPlayInBackground, false); assert.equal(prepared.playsInSilentMode, true);
  listener('background'); hook.play(7, '/audio-sessions/7/audio'); assert.equal(plays, 1); assert.equal(stops, 1);
  listener('active'); hook.play(7, '/audio-sessions/7/audio'); assert.equal(plays, 2);
  cleanup(); hook.play(7, '/audio-sessions/7/audio'); assert.equal(plays, 2); assert.equal(stops, 2); assert.equal(removed, 1);
});

test('session status hook pauses on background, refreshes on focus/foreground and removes subscriptions', () => {
  let effect, listener, focused = 0, blurred = 0, removed = 0;
  const result = createLoader({
    react: { useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}], useCallback: fn => fn },
    'react-native': { AppState: { currentState: 'background', addEventListener: (event, fn) => { listener = fn; return { remove() { removed++; } }; } } },
    'expo-router': { useFocusEffect: fn => { effect = fn; } },
    '../data/session-status-controller': { SessionStatusController: class { focus() { focused++; } blur() { blurred++; } refresh() {} } },
  })('src/features/audio/hooks/use-session-status.ts').useSessionStatus(7);
  const cleanup = effect(); assert.equal(focused, 0);
  listener('active'); assert.equal(focused, 1); listener('background'); assert.equal(blurred, 1);
  listener('active'); assert.equal(focused, 2); cleanup(); assert.equal(blurred, 2); assert.equal(removed, 1);
  assert.equal(typeof result.refresh, 'function');
});

test('session API uses serializable IDs/settings, no-store GET and same-origin audio paths', async () => {
  const calls = [], signal = new AbortController().signal;
  const api = createLoader({}, { fetch: async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({ id: 7, status: 'pending' }) }; } })('src/features/audio/data/audio-sessions-api.ts');
  assert.deepEqual(Array.from(api.parseSelectedIds('[27,27,29,-1,0,"3",null,1.5]')), [27, 29]);
  assert.deepEqual(Array.from(api.parseSelectedIds('invalid')), []);
  assert.match(api.newRequestId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  await api.getAudioSession(7, signal); assert.equal(calls[0].url, 'http://192.168.1.10:5126/audio-sessions/7'); assert.equal(calls[0].options.cache, 'no-store'); assert.equal(calls[0].options.signal, signal);
  const settings = { wordIds: [27], examplesPerWord: 6, includeWordTranslation: false, includeExampleTranslations: true, requestId: 'key' };
  await api.createAudioSession(settings, signal); assert.equal(calls[1].options.method, 'POST'); assert.deepEqual(JSON.parse(calls[1].options.body), settings);
});
