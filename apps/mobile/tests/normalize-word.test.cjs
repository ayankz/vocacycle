const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./helpers/load-ts.cjs');
const { normalizeWord } = createLoader()('src/features/vocabulary/data/normalize-word.ts');

test('trims surrounding whitespace and lowercases text', () => {
  assert.equal(normalizeWord(' \t\nHeLLo\r\n '), 'hello');
  assert.equal(normalizeWord('\u00a0WORLD\u00a0'), 'world');
  assert.equal(normalizeWord('CAFÉ'), 'café');
});

test('preserves internal whitespace and punctuation', () => {
  assert.equal(normalizeWord('  HELLO  World\tAgain\nToday!  '), 'hello  world\tagain\ntoday!');
  assert.equal(normalizeWord("  Mother-In-Law's, (WORD).  "), "mother-in-law's, (word).");
});

test('handles empty, whitespace-only and already normalized values', () => {
  assert.equal(normalizeWord(''), '');
  assert.equal(normalizeWord(' \t\r\n '), '');
  assert.equal(normalizeWord('hello world!'), 'hello world!');
});

test('trims Unicode boundary whitespace without changing the same characters inside words', () => {
  for (const whitespace of ['\v', '\f', '\u00a0', '\u1680', '\u2003', '\u2028', '\u2029', '\u202f', '\u205f', '\u3000', '\ufeff']) {
    assert.equal(normalizeWord(`${whitespace}ONE${whitespace}TWO${whitespace}`), `one${whitespace}two`);
    assert.equal(normalizeWord(whitespace), '');
  }
});

test('preserves punctuation-only values and Unicode punctuation', () => {
  assert.equal(normalizeWord('  ...!?—’  '), '...!?—’');
  assert.equal(normalizeWord('  “DON’T”—RE-ENTER…  '), '“don’t”—re-enter…');
});
