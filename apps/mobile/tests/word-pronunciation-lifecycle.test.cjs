const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./helpers/load-ts.cjs');

function setup(prepare = async () => {}) {
  let focus, listener, mode, activeCleanup, cursor = 0;
  const hooks = [];
  const session = { active: false, keepers: new Set(), deactivations: [] };
  const deactivateLater = () => session.deactivations.push(() => {
    if (session.keepers.size === 0) session.active = false;
  });
  const players = [], alerts = [], timers = new Map(); let timerId = 0;
  const appState = { currentState: 'active', addEventListener(event, callback) {
    assert.equal(event, 'change'); listener = callback; return { remove() { listener = null; } };
  } };
  const load = createLoader({
    react: {
      useState(initial) {
        const slot = cursor++;
        if (!hooks[slot]) hooks[slot] = { value: typeof initial === 'function' ? initial() : initial };
        return [hooks[slot].value, value => { hooks[slot].value = value; }];
      },
      useRef(value) { const slot = cursor++; return hooks[slot] ??= { current: value }; },
      useCallback(fn, deps) {
        const slot = cursor++;
        if (!hooks[slot] || deps.some((dep, index) => !Object.is(dep, hooks[slot].deps[index]))) hooks[slot] = { fn, deps };
        return hooks[slot].fn;
      },
    },
    'expo-router': { useFocusEffect: callback => {
      if (focus && focus !== callback && activeCleanup) { activeCleanup(); activeCleanup = callback(); }
      focus = callback;
    } },
    'react-native': { Alert: { alert: (...args) => alerts.push(args) }, AppState: appState },
    'expo-audio': {
      async setAudioModeAsync(value) { mode = value; await prepare(); },
      createAudioPlayer(source, options) {
        assert.equal(source, null); assert.equal(options.keepAudioSessionActive, true);
        // Model iOS's deferred session teardown separately from JS request callbacks.
        const player = {
          removed: 0, plays: 0, isLoaded: false,
          pause() { if (!options.keepAudioSessionActive) deactivateLater(); },
          remove() { this.removed++; session.keepers.delete(this); deactivateLater(); },
          play() { this.plays++; session.active = true; if (options.keepAudioSessionActive) session.keepers.add(this); },
          replace() { this.isLoaded = true; }, addListener() { return { remove() {} }; },
        };
        players.push(player); return player;
      },
    },
  }, { setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); } });
  const { useWordPronunciation } = load('src/features/home/hooks/use-word-pronunciation.ts');
  let result;
  function render() { cursor = 0; result = useWordPronunciation(); }
  render();
  return {
    get result() { return result; }, players, alerts, timers, session, rerender: render,
    flushDeactivation() { session.deactivations.splice(0).forEach(fn => fn()); }, get mode() { return mode; }, get listening() { return !!listener; },
    focus() { activeCleanup = focus(); return () => { activeCleanup?.(); activeCleanup = null; }; },
    change(state) { appState.currentState = state; listener?.(state); },
    async flush() { for (let i = 0; i < 10; i++) await Promise.resolve(); },
  };
}
const word = { id: '23', word: 'apple', pronunciationAudioUrl: '/words/23/pronunciation' };

test('Home focus enables playback; blur/unmount releases it and removes lifecycle subscription', async () => {
  const s = setup(); s.result.pronounce(word); await s.flush(); assert.equal(s.players.length, 0);
  const cleanup = s.focus(); s.result.pronounce(word); await s.flush();
  assert.equal(s.players[0].plays, 1); assert.equal(s.mode.playsInSilentMode, true); assert.equal(s.mode.shouldPlayInBackground, false);
  cleanup(); assert.equal(s.players[0].removed, 1); assert.equal(s.listening, false); assert.equal(s.timers.size, 0);
  s.result.pronounce(word); await s.flush(); assert.equal(s.players.length, 1);
});

test('backgrounding stops native audio and returning active requires an explicit new tap', async () => {
  const s = setup(); const cleanup = s.focus(); s.result.pronounce(word); await s.flush();
  s.change('background'); assert.equal(s.players[0].removed, 1); assert.equal(s.timers.size, 0);
  s.result.pronounce(word); await s.flush(); assert.equal(s.players.length, 1);
  s.change('active'); await s.flush(); assert.equal(s.players.length, 1);
  s.result.pronounce(word); await s.flush(); assert.equal(s.players.length, 2); cleanup();
});

test('backgrounding during preparation prevents late native-player creation', async () => {
  let finish; const s = setup(() => new Promise(resolve => { finish = resolve; })); const cleanup = s.focus();
  s.result.pronounce(word); s.change('inactive'); finish(); await s.flush();
  assert.equal(s.players.length, 0); assert.equal(s.alerts.length, 0); assert.equal(s.timers.size, 0); cleanup();
});

test('a deferred iOS teardown from an older player cannot deactivate the newer player session', async () => {
  const s = setup(); const cleanup = s.focus();
  s.result.pronounce(word); await s.flush();
  s.result.pronounce({ ...word, id: '24', pronunciationAudioUrl: '/words/24/pronunciation' }); await s.flush();
  assert.equal(s.players[0].removed, 1); assert.equal(s.players[1].plays, 1);
  assert.ok(s.session.deactivations.length > 0); s.flushDeactivation();
  assert.equal(s.session.active, true); assert.equal(s.players[1].removed, 0);
  cleanup(); s.flushDeactivation(); assert.equal(s.session.active, false); assert.equal(s.session.keepers.size, 0);
});

test('React rerenders preserve the controller and do not clean up the active native player', async () => {
  const s = setup(); const cleanup = s.focus(); s.result.pronounce(word); await s.flush();
  const pronounce = s.result.pronounce;
  s.rerender(); s.rerender();
  assert.equal(s.result.pronounce, pronounce); assert.equal(s.players.length, 1);
  assert.equal(s.players[0].removed, 0); assert.equal(s.listening, true);
  s.result.pronounce(word); await s.flush();
  assert.equal(s.players[0].removed, 1); assert.equal(s.players[1].plays, 1); cleanup();
});
