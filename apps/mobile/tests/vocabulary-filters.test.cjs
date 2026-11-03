const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./helpers/load-ts.cjs');
const { filterVocabulary } = createLoader()('src/features/vocabulary/data/filters.ts');
const words = [
  { id: 1, text: 'Bike', translation: 'ВЕЛОСИПЕД', createdAt: '2026-11-02T00:00:00Z', hasAudioSession: false },
  { id: 2, text: 'GLASSES', translation: 'очки', createdAt: '2026-11-01T00:00:00Z', hasAudioSession: true },
  { id: 4, text: 'legacy', translation: null, createdAt: null, hasAudioSession: false },
  { id: 3, text: 'older legacy', translation: null, hasAudioSession: false },
];
const ids = (...args) => Array.from(filterVocabulary(...args), w => w.id);

test('All preserves active input order; trimmed case-insensitive word/translation search handles nullable translation', () => {
  assert.deepEqual(ids(words, '', 'all'), [1, 2, 4, 3]);
  assert.deepEqual(ids(words, ' bIkE ', 'all'), [1]);
  assert.deepEqual(ids(words, 'велосипед', 'all'), [1]);
  assert.deepEqual(ids(words, 'ОЧКИ', 'all'), [2]);
  assert.deepEqual(ids(words, 'missing', 'all'), []);
  assert.deepEqual(ids([], '', 'all'), []);
});

test('Recent sorts dates before IDs, with deterministic legacy fallback and no invented time window', () => {
  assert.deepEqual(ids(words, '', 'recent'), [1, 2, 4, 3]);
  assert.deepEqual(ids(words, 'legacy', 'recent'), [4, 3]);
  const ties = [words[0], { ...words[0], id: 5 }, { ...words[3], createdAt: 'invalid' }];
  assert.deepEqual(ids(ties, '', 'recent'), [5, 1, 3]);
  assert.deepEqual(words.map(w => w.id), [1, 2, 4, 3]);
});

test('Not in Audio composes with search and never treats unknown membership or pronunciation URLs as membership evidence', () => {
  assert.deepEqual(ids(words, '', 'not-in-audio'), [1, 4, 3]);
  assert.deepEqual(ids(words, 'очки', 'not-in-audio'), []);
  assert.deepEqual(ids(words, 'bike', 'not-in-audio'), [1]);
  assert.deepEqual(ids([{ id: 10, text: 'unknown', pronunciationAudioUrl: '/words/10/pronunciation' }], '', 'not-in-audio'), []);
  assert.deepEqual(ids([{ ...words[0], pronunciationAudioUrl: '/words/1/pronunciation' }], '', 'not-in-audio'), [1]);
});
