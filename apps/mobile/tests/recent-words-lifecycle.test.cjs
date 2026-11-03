const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./helpers/load-ts.cjs');

test('refresh follows Home focus and foreground and removes its AppState listener on cleanup', () => {
  let effect, listener, cleanup, focused = 0, blurred = 0, removed = 0;
  const appState = { currentState: 'background', addEventListener(event, fn) {
    assert.equal(event, 'change'); listener = fn; return { remove() { removed++; listener = null; } };
  } };
  const load = createLoader({
    '../data/deletion-store': { deletionStore: {} },
    '../data/word-deletion-controller': { WordDeletionController: class { start() {} stop() {} retry() {} } },
    react: { useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}], useCallback: fn => fn },
    'react-native': { AppState: appState },
    'expo-router': { useFocusEffect: fn => { effect = fn; } },
    '../data/recent-words-controller': { RecentWordsController: class {
      focus() { focused++; }
      blur() { blurred++; }
    } },
  });
  load('src/features/home/hooks/use-recent-words.ts').useRecentWords();
  cleanup = effect(); assert.equal(focused, 0);
  listener('active'); assert.equal(focused, 1);
  listener('inactive'); assert.equal(blurred, 1);
  listener('background'); assert.equal(blurred, 2);
  listener('active'); assert.equal(focused, 2);
  cleanup(); assert.equal(blurred, 3); assert.equal(removed, 1); assert.equal(listener, null);
});

test('words hook exposes the controller manual refresh callback and controlled refreshing state', () => {
  const refresh = () => {};
  const load = createLoader({
    '../data/deletion-store': { deletionStore: {} },
    '../data/word-deletion-controller': { WordDeletionController: class { start() {} stop() {} retry() {} } },
    react: {
      useState(initial) {
        const value = typeof initial === 'function' ? initial() : initial;
        return [value?.words ? { ...value, refreshing: true } : value, () => {}];
      },
      useCallback: fn => fn,
    },
    'react-native': { AppState: {} },
    'expo-router': { useFocusEffect() {} },
    '../data/recent-words-controller': { RecentWordsController: class { refreshManually = refresh; } },
  });
  const result = load('src/features/home/hooks/use-recent-words.ts').useRecentWords();
  assert.equal(result.wordsRefreshing, true);
  // Refresh is now composed with pending-delete reconciliation.
  assert.equal(typeof result.onRefresh, 'function');
  result.onRefresh();
});
