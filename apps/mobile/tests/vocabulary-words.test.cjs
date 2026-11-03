const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./helpers/load-ts.cjs');

test('Vocabulary reuses loading lifecycle and excludes Home pending deletion without owning a journal', () => {
  let effect, listener, focused = 0, blurred = 0, removed = 0, pending = 27, refreshes = 0;
  const words = [{ id: 27, text: 'bike' }, { id: 29, text: 'glasses' }];
  const load = createLoader({
    react: {
      useState: initial => { const value = typeof initial === 'function' ? initial() : initial; return [value?.words ? { ...value, words } : value, () => {}]; },
      useMemo: fn => fn(), useCallback: fn => fn, useSyncExternalStore: (subscribe, get) => get(),
    },
    'react-native': { AppState: { currentState: 'active', addEventListener: (event, fn) => { listener = fn; return { remove() { removed++; } }; } } },
    'expo-router': { useFocusEffect: fn => { effect = fn; } },
    '@/features/home/data/recent-words-controller': { RecentWordsController: class { focus() { focused++; } blur() { blurred++; } refreshManually() { refreshes++; } } },
    '@/features/home/data/pending-removal': { getPendingRemoval: () => pending, subscribePendingRemoval() {} },
  });
  const useWords = load('src/features/vocabulary/hooks/use-vocabulary-words.ts').useVocabularyWords;
  assert.deepEqual(Array.from(useWords().words, w => w.id), [29]);
  const cleanup = effect(); assert.equal(focused, 1);
  listener('background'); assert.equal(blurred, 1);
  listener('active'); assert.equal(focused, 2);
  pending = null;
  const result = useWords(); assert.deepEqual(Array.from(result.words, w => w.id), [27, 29]);
  result.refresh(); assert.equal(refreshes, 1);
  cleanup(); assert.equal(blurred, 2); assert.equal(removed, 1);
});

test('pending removal publishes changes and unsubscribe stops updates', () => {
  const p = createLoader()('src/features/home/data/pending-removal.ts');
  let calls = 0; const unsubscribe = p.subscribePendingRemoval(() => calls++);
  p.setPendingRemoval(27); assert.equal(p.getPendingRemoval(), 27); assert.equal(calls, 1);
  p.setPendingRemoval(27); assert.equal(calls, 1);
  p.setPendingRemoval(null); assert.equal(calls, 2);
  unsubscribe(); p.setPendingRemoval(29); assert.equal(calls, 2);
});
