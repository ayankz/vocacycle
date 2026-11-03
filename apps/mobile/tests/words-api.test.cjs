const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./helpers/load-ts.cjs');

test('GET words bypasses cached responses and preserves metadata and cancellation', async () => {
  const signal = new AbortController().signal;
  const words = [{ id: 27, text: 'bike', translation: 'велосипед', ipa: null, pronunciationAudioUrl: '/words/27/pronunciation' }];
  let calls = 0;
  const load = createLoader({}, { fetch: async (url, options) => {
    calls++; assert.equal(url, 'http://192.168.1.10:5126/words');
    assert.equal(options.cache, 'no-store'); assert.equal(options.signal, signal);
    return { ok: true, json: async () => words };
  } });
  const { getWords } = load('src/features/home/data/words-api.ts');
  assert.equal(await getWords(signal), words);
  assert.equal(await getWords(signal), words);
  assert.equal(calls, 2);
});

test('DELETE success does not invoke GET, Add or paid regeneration', async () => {
  const calls = [];
  const { deleteWord } = createLoader({}, { fetch: async (url, options) => {
    calls.push({ url, options }); return { ok: true, status: 204 };
  } })('src/features/home/data/words-api.ts');
  await deleteWord(27, new AbortController().signal);
  assert.equal(calls.length, 1); assert.equal(calls[0].options.method, 'DELETE');
  assert.equal(calls[0].url, 'http://192.168.1.10:5126/words/27');
});

test('failed/lost DELETE confirms server state before restoring or declaring success', async () => {
  for (const status of [404, 503, 'network']) for (const exists of [false, true]) {
    let calls = 0;
    const { deleteWord } = createLoader({}, { fetch: async (_, options) => {
      calls++;
      if (options.method === 'DELETE') {
        if (status === 'network') throw Error('connection lost');
        return { ok: false, status };
      }
      assert.equal(options.cache, 'no-store');
      return { ok: true, json: async () => exists ? [{ id: 27 }] : [] };
    } })('src/features/home/data/words-api.ts');
    const result = deleteWord(27, new AbortController().signal);
    if (exists) await assert.rejects(result, error => error.confirmedKept === true);
    else await result;
    assert.equal(calls, 2);
  }
});
