const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./helpers/load-ts.cjs');

const word = (id = '23', pronunciationAudioUrl = '/words/23/pronunciation') => ({ id, pronunciationAudioUrl });
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function setup(prepare = async () => {}, autoLoad = true) {
  const players = [], timers = new Map(), states = [], errors = [];
  let timerId = 0;
  const load = createLoader({}, {
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; },
    clearTimeout(id) { timers.delete(id); },
  });
  const { PronunciationController } = load('src/features/home/data/pronunciation-controller.ts');
  function create() {
    const player = {
      plays: 0, pauses: 0, removed: 0, listener: null, savedListener: null, isLoaded: false,
      play() { this.plays++; }, pause() { this.pauses++; }, remove() { this.removed++; },
      replace(source) { this.source = source; this.isLoaded = autoLoad; },
      addListener(event, listener) {
        assert.equal(event, 'playbackStatusUpdate');
        this.listener = this.savedListener = listener;
        return { remove: () => { this.listener = null; } };
      },
      emit(status) {
        if (Object.hasOwn(status, 'isLoaded')) this.isLoaded = status.isLoaded;
        this.listener?.({ playing: false, isBuffering: false, didJustFinish: false, error: null, isLoaded: this.isLoaded, ...status });
      },
    };
    players.push(player); return player;
  }
  const controller = new PronunciationController(create, prepare, s => states.push(s), () => errors.push('unavailable'));
  return { controller, players, timers, errors, get state() { return states.at(-1); }, expire() { const fn = [...timers.values()][0]; assert.ok(fn); fn(); } };
}

test('resolves LAN relative and same-origin absolute URLs, including base paths', () => {
  const { resolvePronunciationUrl: resolve } = createLoader()('src/features/home/data/pronunciation-url.ts');
  assert.equal(resolve('/words/23/pronunciation', 'http://192.168.1.10:5126/'), 'http://192.168.1.10:5126/words/23/pronunciation');
  assert.equal(resolve('words/23/pronunciation', 'https://api.example.com/api'), 'https://api.example.com/api/words/23/pronunciation');
  assert.equal(resolve('https://api.example.com/words/23/pronunciation', 'https://api.example.com'), 'https://api.example.com/words/23/pronunciation');
});

test('rejects unavailable audio, unsafe schemes, credentials and foreign origins', () => {
  const { resolvePronunciationUrl: resolve } = createLoader()('src/features/home/data/pronunciation-url.ts');
  for (const value of [null, undefined, '', ' ', 'file:///tmp/a.mp3', 'data:audio/mpeg,abc', 'javascript:alert(1)', '//evil.example/audio', 'https://evil.example/audio', 'https://user:password@api.example.com/audio', '/audio#fragment']) {
    assert.throws(() => resolve(value, 'https://api.example.com'));
  }
  for (const base of ['', 'invalid', 'file:///tmp/', 'https://user:password@api.example.com', 'https://api.example.com?key=secret']) {
    assert.throws(() => resolve('/audio', base));
  }
});

test('loads on tap, updates playing state, and releases native resources on completion', async () => {
  const s = setup(); await s.controller.play(word());
  assert.equal(s.state.phase, 'loading');
  assert.equal(s.players[0].source.uri, 'http://192.168.1.10:5126/words/23/pronunciation');
  assert.equal(s.players[0].plays, 1);
  s.players[0].emit({ playing: true });
  assert.equal(s.state.phase, 'playing'); assert.equal(s.timers.size, 0);
  s.players[0].emit({ didJustFinish: true });
  assert.equal(s.state.phase, 'idle'); assert.equal(s.players[0].removed, 1); assert.equal(s.players[0].listener, null);
});

test('same word replays after completion and restarts safely while playing', async () => {
  const s = setup(); await s.controller.play(word()); s.players[0].emit({ playing: true });
  await s.controller.play(word());
  assert.equal(s.players[0].removed, 1); assert.equal(s.players[1].plays, 1);
  s.players[1].emit({ didJustFinish: true }); await s.controller.play(word());
  assert.equal(s.players.length, 3); assert.equal(s.players[2].plays, 1);
});

test('switching words releases old audio and ignores its late status/error events', async () => {
  const s = setup(); await s.controller.play(word()); s.players[0].emit({ playing: true });
  await s.controller.play(word('24', '/words/24/pronunciation'));
  assert.equal(s.players[0].pauses, 1); assert.equal(s.players[0].removed, 1);
  s.players[0].savedListener({ playing: true, error: 'late network failure' });
  assert.equal(s.state.wordId, '24'); assert.equal(s.state.phase, 'loading'); assert.equal(s.errors.length, 0);
});

test('every tap during preparation creates a request; only the latest may start playback', async () => {
  const first = deferred(), second = deferred(), third = deferred(); let calls = 0;
  const waits = [first, second, third];
  const s = setup(() => waits[calls++].promise);
  const a = s.controller.play(word());
  const b = s.controller.play(word());
  const c = s.controller.play(word('24', '/words/24/pronunciation'));
  assert.equal(calls, 3);
  third.resolve(); await c;
  second.reject(new Error('stale mode failure')); await b;
  first.resolve(); await a;
  assert.equal(s.players.length, 1); assert.equal(s.players[0].source.uri.endsWith('/24/pronunciation'), true);
  assert.equal(s.players[0].plays, 1); assert.equal(s.errors.length, 0);
});

test('stop during asynchronous preparation prevents delayed playback or errors', async () => {
  const wait = deferred(); const s = setup(() => wait.promise);
  const pending = s.controller.play(word()); s.controller.stop(); wait.reject(new Error('late failure')); await pending;
  assert.equal(s.players.length, 0); assert.equal(s.errors.length, 0); assert.equal(s.timers.size, 0);
});

test('network/native errors release resources, report once, and allow manual retry', async () => {
  const s = setup(); await s.controller.play(word());
  s.players[0].emit({ error: 'HTTP 404' }); s.players[0].savedListener({ error: 'duplicate' });
  assert.equal(s.state.phase, 'idle'); assert.equal(s.errors.length, 1); assert.equal(s.players[0].removed, 1);
  await s.controller.play(word()); assert.equal(s.players.length, 2);
});

test('preparation and persistent buffering time out without automatic retries', async () => {
  const wait = deferred(); const s = setup(() => wait.promise);
  const pending = s.controller.play(word()); s.expire(); wait.resolve(); await pending;
  assert.equal(s.errors.length, 1); assert.equal(s.players.length, 0);
  const buffered = setup(); await buffered.controller.play(word()); buffered.players[0].emit({ playing: true });
  buffered.players[0].emit({ playing: true, isBuffering: true });
  assert.equal(buffered.state.phase, 'loading'); buffered.expire();
  assert.equal(buffered.players[0].removed, 1); assert.equal(buffered.errors.length, 1);
});

test('native setup failures and missing URLs report safe errors without leaving loading active', async () => {
  const s = setup(async () => { throw new Error('native mode failure'); });
  await s.controller.play(word()); assert.equal(s.state.phase, 'idle'); assert.equal(s.errors.length, 1);
  const missing = setup(); await missing.controller.play(word('23', ''));
  assert.equal(missing.players.length, 0); assert.equal(missing.errors.length, 1); assert.equal(missing.timers.size, 0);
});

test('stop releases playing audio and late events cannot restart it', async () => {
  const s = setup(); await s.controller.play(word()); s.players[0].emit({ playing: true }); s.controller.stop();
  s.players[0].savedListener({ playing: true });
  assert.equal(s.state.phase, 'idle'); assert.equal(s.players[0].removed, 1); assert.equal(s.timers.size, 0);
});

test('OS playback interruption releases pronunciation without automatically restarting', async () => {
  const s = setup(); await s.controller.play(word()); s.players[0].emit({ playing: true }); s.players[0].emit({ playing: false });
  assert.equal(s.state.phase, 'idle'); assert.equal(s.players[0].removed, 1); assert.equal(s.errors.length, 0);
});

test('remote source gets exactly one play command after readiness, never before loading', async () => {
  const s = setup(async () => {}, false); await s.controller.play(word());
  const player = s.players[0];
  assert.equal(player.plays, 0); assert.equal(s.state.phase, 'loading');
  player.emit({ isLoaded: false, playing: false, isBuffering: true });
  assert.equal(player.plays, 0);
  player.emit({ isLoaded: true });
  assert.equal(player.plays, 1); assert.equal(player.removed, 0);
  assert.equal(s.state.phase, 'loading'); // Command issued is not evidence of audible playback.
  player.emit({ isLoaded: true });
  assert.equal(player.plays, 1);
  player.emit({ isLoaded: true, playing: true });
  assert.equal(s.state.phase, 'playing');
});

test('A -> B -> C ignores stale ready, finish, pause and error events from released players', async () => {
  const s = setup(async () => {}, false);
  await s.controller.play(word('A', '/words/1/pronunciation'));
  await s.controller.play(word('B', '/words/2/pronunciation'));
  await s.controller.play(word('C', '/words/3/pronunciation'));
  for (const old of s.players.slice(0, 2)) {
    assert.equal(old.removed, 1); assert.equal(old.plays, 0);
    for (const status of [{ isLoaded: true }, { didJustFinish: true }, { playing: false }, { error: 'stale' }]) old.savedListener(status);
  }
  const latest = s.players[2]; latest.emit({ isLoaded: true }); latest.emit({ playing: true });
  assert.equal(latest.plays, 1); assert.equal(latest.removed, 0);
  assert.equal(s.state.wordId, 'C'); assert.equal(s.state.phase, 'playing'); assert.equal(s.errors.length, 0);
});

test('repeated loading taps on the same word supersede the old source and start once ready', async () => {
  const s = setup(async () => {}, false);
  await s.controller.play(word()); await s.controller.play(word()); await s.controller.play(word());
  assert.equal(s.players.length, 3);
  s.players[0].savedListener({ isLoaded: true }); s.players[1].savedListener({ isLoaded: true });
  assert.equal(s.players[0].plays, 0); assert.equal(s.players[1].plays, 0);
  s.players[2].emit({ isLoaded: true });
  assert.equal(s.players[2].plays, 1); assert.equal(s.players[2].removed, 0);
});

test('queued timeout from an old request cannot stop a newer player', async () => {
  const s = setup(async () => {}, false); await s.controller.play(word('A'));
  const staleTimeout = [...s.timers.values()][0];
  await s.controller.play(word('B')); s.players[1].emit({ isLoaded: true }); s.players[1].emit({ playing: true });
  staleTimeout(); assert.equal(s.players[1].removed, 0); assert.equal(s.state.wordId, 'B'); assert.equal(s.errors.length, 0);
});

test('stop while loading prevents a late ready event from starting native playback', async () => {
  const s = setup(async () => {}, false); await s.controller.play(word()); s.controller.stop();
  s.players[0].isLoaded = true; s.players[0].savedListener({ isLoaded: true });
  assert.equal(s.players[0].plays, 0); assert.equal(s.players[0].removed, 1); assert.equal(s.state.phase, 'idle');
});

test('native play failure on readiness clears loading and does not retry', async () => {
  const s = setup(async () => {}, false); await s.controller.play(word());
  const player = s.players[0]; player.play = () => { player.plays++; throw new Error('native failure'); };
  player.emit({ isLoaded: true });
  assert.equal(player.plays, 1); assert.equal(player.removed, 1); assert.equal(s.errors.length, 1); assert.equal(s.state.phase, 'idle');
});
