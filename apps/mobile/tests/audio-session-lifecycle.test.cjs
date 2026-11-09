const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./helpers/load-ts.cjs');

test('session playback prepares background audio, starts on readiness and releases on unmount', async () => {
  let effect, listener, prepared, source, removed = 0, subscriptionsRemoved = 0, plays = 0;
  const player = {
    isLoaded: false,
    addListener(event, callback) { assert.equal(event, 'playbackStatusUpdate'); listener = callback; return { remove() { subscriptionsRemoved++; } }; },
    replace(value) { source = value; },
    setPlaybackRate(value) { assert.equal(value, 1); },
    setActiveForLockScreen() {},
    play() { plays++; }, pause() {}, remove() { removed++; },
  };
  const hook = createLoader({
    react: {
      useState: initial => [initial, () => {}], useRef: value => ({ current: value }),
      useEffect: fn => { effect = fn; },
    },
    'expo-audio': { createAudioPlayer: () => player, setAudioModeAsync: async options => { prepared = options; } },
  })('src/features/audio/hooks/use-session-playback.ts').useSessionPlayback(7);
  const cleanup = effect();
  try {
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(prepared.shouldPlayInBackground, true);
    assert.equal(prepared.playsInSilentMode, true);
    assert.equal(source.uri, 'http://192.168.1.10:5126/audio-sessions/7/audio');
    assert.equal(plays, 0);
    listener({ isLoaded: true, isBuffering: false, playing: false, currentTime: 0, duration: 62 });
    assert.equal(plays, 1);
    assert.equal(typeof hook.seek, 'function');
  } finally { cleanup(); }
  assert.equal(removed, 1);
  assert.equal(subscriptionsRemoved, 1);
  listener({ isLoaded: true, playing: true });
  assert.equal(plays, 1);
});
