const { test } = require('node:test');
const assert = require('node:assert/strict');

function setup(load) {
  const timers = new Map();
  let next = 0;
  let state;
  const loadModule = require('./helpers/load-ts.cjs')({}, {
    AbortController,
    setTimeout(fn, delay) { const id = ++next; timers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  const { RecentWordsController } = loadModule('src/features/home/data/recent-words-controller.ts');
  const controller = new RecentWordsController(load, value => { state = value; });
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
const word = (id, translation = null) => ({ id, text: `word${id}`, translation, ipa: translation ? "/wɜːd/" : null, pronunciationAudioUrl: `/words/${id}/pronunciation` });

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


test('translation arriving before IPA keeps the shared timer alive', async () => {
  let words = [{ ...word(1, 'слово'), ipa: null }];
  const s = setup(async () => words);
  s.controller.focus(); await s.flush();
  s.controller.added(words[0]); await s.flush();
  await s.tick();
  assert.equal(s.state.attempts.get(1), 1);
  words = [word(1, 'слово')];
  await s.tick();
  assert.equal(s.state.words[0].ipa, '/wɜːd/');
  assert.equal(s.state.attempts.size, 0);
  assert.equal(s.timers.size, 0);
});

test('IPA arriving first preserves translation polling; absent IPA stays bounded', async () => {
  const s = setup(async () => [{ ...word(1), ipa: '/wɜːd/' }]);
  s.controller.focus(); await s.flush();
  s.controller.added({ ...word(1), ipa: '/wɜːd/' }); await s.flush();
  for (let i = 0; i < 5; i++) await s.tick();
  assert.equal(s.state.attempts.get(1), 5);
  assert.equal(s.state.words[0].ipa, '/wɜːd/');
  assert.equal(s.timers.size, 0);
});

const { pronunciationAvailability } = require('./helpers/load-ts.cjs')()('src/features/home/data/pronunciation-status.ts');
const pendingAudio = id => ({ ...word(id, 'слово'), pronunciationAudioUrl: null });
const availability = (s, id = 1) => pronunciationAvailability(
  s.state.words.find(w => w.id === id)?.pronunciationAudioUrl, s.state.pronunciationAttempts.get(id),
);

test('pronunciation continues after translation and IPA, then Generating → Ready stops polling', async () => {
  let words = [pendingAudio(1)]; let calls = 0;
  const s = setup(async () => { calls++; return words; });
  s.controller.focus(); await s.flush();
  assert.equal(availability(s), 'unavailable'); // Old null URL is not evidence of a running job.
  assert.equal(s.timers.size, 0);
  s.controller.added(words[0]); await s.flush();
  assert.equal(availability(s), 'generating');
  assert.equal(s.state.attempts.size, 0);
  await s.tick(); assert.equal(availability(s), 'generating');
  words = [word(1, 'слово')]; await s.tick();
  assert.equal(availability(s), 'ready');
  assert.equal(s.state.pronunciationAttempts.size, 0);
  assert.equal(s.timers.size, 0);
  assert.equal(calls, 4);
});

test('missing audio and network failures become unavailable after ninety polls without resetting on focus', async () => {
  for (const fails of [false, true]) {
    let fail = false;
    const s = setup(async () => { if (fail) throw Error('offline'); return [pendingAudio(1)]; });
    s.controller.focus(); await s.flush(); s.controller.added(pendingAudio(1)); await s.flush();
    fail = fails;
    for (let i = 0; i < 90; i++) await s.tick();
    assert.equal(availability(s), 'unavailable');
    assert.equal(s.state.pronunciationAttempts.get(1), 90);
    assert.equal(s.timers.size, 0);
    s.controller.blur(); s.controller.focus(); await s.flush();
    assert.equal(availability(s), 'unavailable');
    assert.equal(s.timers.size, 0);
  }
});

test('pronunciation blur drops stale ready response and does not consume a suspended budget', async () => {
  let resolve;
  let words = [pendingAudio(1)];
  const s = setup(() => new Promise(r => { resolve = r; }));
  s.controller.focus(); s.controller.added(words[0]);
  s.controller.blur(); s.controller.focus();
  resolve([word(1, 'stale')]); await s.flush();
  assert.equal(availability(s), 'generating');
  assert.equal(s.state.words[0].translation, 'слово');
  assert.equal(s.state.pronunciationAttempts.get(1), 0);
  resolve(words); await s.flush();
  s.controller.blur(); assert.equal(s.timers.size, 0);
});

test('late pronunciation response after unmount does not publish or restart a timer', async () => {
  let resolve;
  const s = setup(() => new Promise(r => { resolve = r; }));
  s.controller.focus(); s.controller.added(pendingAudio(1));
  const before = s.state;
  s.controller.blur(); resolve([word(1, 'слово')]); await s.flush();
  assert.equal(s.state, before);
  assert.equal(s.timers.size, 0);
});

test('each new pronunciation gets its own budget while sharing a single request timer', async () => {
  const words = [pendingAudio(1)];
  const s = setup(async () => [...words]);
  s.controller.focus(); await s.flush(); s.controller.added(words[0]); await s.flush();
  for (let i = 0; i < 89; i++) await s.tick();
  words.push(pendingAudio(2)); s.controller.added(words[1]); await s.flush(); await s.tick();
  assert.equal(availability(s, 1), 'unavailable');
  assert.equal(availability(s, 2), 'generating');
  assert.equal(s.state.pronunciationAttempts.get(2), 1);
  assert.equal(s.timers.size, 1);
  s.controller.blur();
});

test('a delayed Add callback after blur records pending work without publishing after unmount', async () => {
  const s = setup(async () => []);
  s.controller.focus(); await s.flush();
  const before = s.state;
  s.controller.blur(); s.controller.added(pendingAudio(1));
  assert.equal(s.state, before);
  assert.equal(s.timers.size, 0);
  s.controller.focus(); await s.flush();
  assert.equal(availability(s), 'generating');
  s.controller.blur();
});

test('stalled pronunciation requests exhaust the budget and clear spinners', async () => {
  let stall = false;
  const s = setup(signal => stall
    ? new Promise((_, reject) => signal.addEventListener('abort', () => reject(Error('aborted'))))
    : Promise.resolve([pendingAudio(1)]));
  s.controller.focus(); await s.flush(); s.controller.added(pendingAudio(1)); await s.flush(); stall = true;
  for (let i = 0; i < 90; i++) { await s.tick(); await s.tick(8000); }
  assert.equal(availability(s), 'unavailable');
  assert.equal(s.timers.size, 0);
});


test('audio available at 125 seconds becomes Ready on the next automatic two-second poll', async () => {
  let elapsed = 0;
  let calls = 0;
  const s = setup(async () => {
    calls++;
    return [elapsed >= 125000 ? word(27, 'велосипед') : pendingAudio(27)];
  });
  s.controller.focus(); await s.flush();
  s.controller.added(pendingAudio(27)); await s.flush();
  for (let i = 0; i < 62; i++) {
    elapsed += 2000;
    await s.tick(2000);
    assert.equal(availability(s, 27), 'generating');
  }
  assert.equal(elapsed, 124000);
  assert.equal(s.state.pronunciationAttempts.get(27), 62);
  // The backend completes at 125 seconds, between the 124s and 126s polls.
  elapsed = 126000;
  await s.tick(2000);
  assert.equal(availability(s, 27), 'ready');
  assert.equal(s.state.words[0].pronunciationAudioUrl, '/words/27/pronunciation');
  assert.equal(s.state.pronunciationAttempts.has(27), false);
  assert.equal(s.timers.size, 0);
  assert.equal(calls, 65); // Focus + Add refresh + 63 automatic polls; no manual refresh.
});

test('missing IPA does not keep pronunciation generating after audio becomes available', async () => {
  let words = [{ ...pendingAudio(27), ipa: null }];
  const s = setup(async () => words);
  s.controller.focus(); await s.flush(); s.controller.added(words[0]); await s.flush();
  assert.equal(availability(s, 27), 'generating');
  words = [{ ...word(27, 'велосипед'), ipa: null }];
  await s.tick();
  assert.equal(availability(s, 27), 'ready');
  assert.equal(s.state.words[0].ipa, null);
  assert.equal(s.state.pronunciationAttempts.has(27), false);
  assert.equal(s.state.attempts.get(27), 1); // IPA's separate bounded refresh may continue.
  for (let i = 0; i < 4; i++) await s.tick();
  assert.equal(availability(s, 27), 'ready');
  assert.equal(s.timers.size, 0);
});

test('manual refresh discovers complete metadata after automatic polling has stopped', async () => {
  let words = [{ ...pendingAudio(27), translation: null, ipa: null }]; let calls = 0;
  const s = setup(async () => { calls++; return words; });
  s.controller.focus(); await s.flush(); s.controller.added(words[0]); await s.flush();
  for (let i = 0; i < 90; i++) await s.tick();
  assert.equal(availability(s, 27), 'unavailable'); assert.equal(s.timers.size, 0);
  const before = calls;
  words = [word(27, 'велосипед')]; s.controller.refreshManually();
  assert.equal(s.state.refreshing, true); await s.flush();
  assert.equal(calls, before + 1); assert.equal(s.state.refreshing, false);
  assert.equal(availability(s, 27), 'ready'); assert.equal(s.state.words[0].translation, 'велосипед');
  assert.equal(s.state.words[0].ipa, '/wɜːd/');
  assert.equal(s.state.attempts.size, 0); assert.equal(s.state.pronunciationAttempts.size, 0);
  assert.equal(s.timers.size, 0);
});

test('manual refresh changes Generating to Ready without consuming poll attempts', async () => {
  let words = [pendingAudio(27)];
  const s = setup(async () => words);
  s.controller.focus(); await s.flush(); s.controller.added(words[0]); await s.flush();
  assert.equal(availability(s, 27), 'generating');
  s.controller.refreshManually(); await s.flush();
  assert.equal(s.state.pronunciationAttempts.get(27), 0);
  words = [word(27, 'велосипед')]; s.controller.refreshManually(); await s.flush();
  assert.equal(availability(s, 27), 'ready'); assert.equal(s.state.refreshing, false);
  assert.equal(s.timers.size, 0);
});

test('repeated pulls during a GET serialize one fresh follow-up request and keep the indicator active', async () => {
  let resolve; let calls = 0; let inflight = 0; let max = 0;
  const s = setup(() => {
    calls++; max = Math.max(max, ++inflight);
    return new Promise(r => { resolve = words => { inflight--; r(words); }; });
  });
  s.controller.focus();
  for (let i = 0; i < 5; i++) s.controller.refreshManually();
  assert.equal(calls, 1); assert.equal(s.state.refreshing, true);
  resolve([pendingAudio(27)]); await s.flush();
  assert.equal(calls, 2); assert.equal(s.state.refreshing, true);
  for (let i = 0; i < 5; i++) s.controller.refreshManually();
  assert.equal(calls, 2);
  resolve([word(27, 'велосипед')]); await s.flush();
  assert.equal(max, 1); assert.equal(calls, 2);
  assert.equal(s.state.refreshing, false); assert.equal(availability(s, 27), 'ready');
});

test('manual refresh failure preserves words, clears its indicator and supports another pull', async () => {
  let fail = false;
  const s = setup(async () => { if (fail) throw Error('offline'); return [word(27, 'велосипед')]; });
  s.controller.focus(); await s.flush(); fail = true;
  s.controller.refreshManually(); await s.flush();
  assert.equal(s.state.refreshing, false); assert.equal(s.state.error, 'offline');
  assert.equal(s.state.words[0].id, 27); assert.equal(availability(s, 27), 'ready');
  fail = false; s.controller.refreshManually(); await s.flush();
  assert.equal(s.state.refreshing, false); assert.equal(s.state.error, null);
});

test('manual timeout releases an uncooperative transport; its late response cannot affect the next refresh', async () => {
  let stall = false; const completions = [];
  const s = setup(() => stall ? new Promise(r => completions.push(r)) : Promise.resolve([word(27, 'велосипед')]));
  s.controller.focus(); await s.flush(); stall = true;
  s.controller.refreshManually(); await s.tick(8000);
  assert.equal(s.state.refreshing, false); assert.match(s.state.error, /Could not refresh/);
  assert.equal(s.timers.size, 0);
  s.controller.refreshManually(); assert.equal(completions.length, 2);
  completions[0]([pendingAudio(27)]); await s.flush();
  assert.equal(s.state.refreshing, true); assert.equal(availability(s, 27), 'ready');
  completions[1]([word(27, 'свежее')]); await s.flush();
  assert.equal(s.state.refreshing, false); assert.equal(s.state.words[0].translation, 'свежее');
});

test('blur cancels manual refresh; refocus starts a fresh GET and rejects stale completion', async () => {
  let stall = false; const requests = [];
  const s = setup(signal => stall ? new Promise(resolve => requests.push({ signal, resolve })) : Promise.resolve([word(27, 'велосипед')]));
  s.controller.focus(); await s.flush(); stall = true;
  s.controller.refreshManually(); const before = s.state;
  s.controller.blur(); await s.flush();
  assert.equal(requests[0].signal.aborted, true); assert.equal(s.timers.size, 0);
  assert.equal(s.state, before); // No state publication after unmount.
  s.controller.focus(); assert.equal(s.state.refreshing, false);
  requests[1].resolve([word(27, 'свежее')]); await s.flush();
  requests[0].resolve([pendingAudio(27)]); await s.flush();
  assert.equal(s.state.words[0].translation, 'свежее'); assert.equal(availability(s, 27), 'ready');
  assert.equal(s.state.refreshing, false);
});

test('an unsuccessful availability refresh does not restart an exhausted polling budget', async () => {
  const s = setup(async () => [pendingAudio(27)]);
  s.controller.focus(); await s.flush(); s.controller.added(pendingAudio(27)); await s.flush();
  for (let i = 0; i < 90; i++) await s.tick();
  s.controller.refreshManually(); await s.flush();
  assert.equal(s.state.pronunciationAttempts.get(27), 90);
  assert.equal(s.state.refreshing, false); assert.equal(s.timers.size, 0);
  assert.equal(availability(s, 27), 'unavailable');
});

test('a stale GET cannot resurrect a word after its DELETE has committed', async () => {
  let resolve;
  const s = setup(() => new Promise(r => { resolve = r; }));
  s.controller.focus(); s.controller.added(word(27)); s.controller.removed(27);
  resolve([word(27)]); await s.flush();
  assert.equal(s.state.words.length, 0); assert.equal(s.state.attempts.has(27), false);
  s.controller.blur();
});
