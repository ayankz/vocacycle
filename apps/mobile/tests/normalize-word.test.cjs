const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./helpers/load-ts.cjs');
const { normalizeWord } = createLoader()('src/features/vocabulary/data/normalize-word.ts');

test('trims surrounding whitespace and lowercases text', () => {
  assert.equal(normalizeWord(' \tHeLLo\r\n'), 'hello');
  assert.equal(normalizeWord('\u00a0CAFÉ\u00a0'), 'café');
  assert.equal(normalizeWord('already lowercase'), 'already lowercase');
});

test('preserves internal whitespace and punctuation', () => {
  assert.equal(normalizeWord('  HELLO,  WORLD!\tIT\'S\nWELL-KNOWN.  '), "hello,  world!\tit's\nwell-known.");
  assert.equal(normalizeWord(' !?... '), '!?...');
});

test('handles empty and whitespace-only strings', () => {
  assert.equal(normalizeWord(''), '');
  assert.equal(normalizeWord(' \t\r\n\u00a0'), '');
});

test('trims either edge independently without collapsing internal whitespace', () => {
  const cases = [
    ['\tWORD', 'word'],
    ['WORD\n', 'word'],
    [' A ', 'a'],
    ['  TWO\u00a0\u00a0WORDS  ', 'two\u00a0\u00a0words'],
    ['  A\r\n\tB  ', 'a\r\n\tb'],
    ['  “DON’T” — RE-ENTER_123?!  ', '“don’t” — re-enter_123?!'],
  ];

  for (const [input, expected] of cases) {
    assert.equal(normalizeWord(input), expected, JSON.stringify(input));
  }
});
