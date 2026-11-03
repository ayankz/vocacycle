const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./helpers/load-ts.cjs');

function setup(refreshing) {
  const onRefresh = () => {};
  const pronunciation = { wordId: '27', phase: 'playing' };
  const native = { Alert: {}, ScrollView: () => null, RefreshControl: () => null, StyleSheet: { create: value => value } };
  const mocks = {
    'react-native': native,
    'react-native-safe-area-context': { SafeAreaView: () => null },
    '@/features/home/hooks/use-recent-words': { useRecentWords: () => ({
      recentWords: [], totalWordCount: 0, wordsLoading: false, wordsRefreshing: refreshing, wordsError: null, onRefresh, onAdded() {},
    }) },
    '@/features/home/hooks/use-word-pronunciation': { useWordPronunciation: () => ({ pronunciation, pronounce() {} }) },
  };
  const components = {};
  for (const name of ['HomeHeader', 'QuickAddWord', 'WordsReadyForAudioCard', 'RecentWordsSection', 'HomeListeningStats']) {
    components[name] = () => null;
    mocks[`@/features/home/components/${name}`] = { [name]: components[name] };
  }
  const tree = createLoader(mocks)('src/app/index.tsx').default();
  return { scroll: tree.props.children[0], native, onRefresh, pronunciation, components };
}

test('Home wires controlled native amber pull-to-refresh and keeps the playback state', () => {
  for (const refreshing of [false, true]) {
    const s = setup(refreshing);
    const refresh = s.scroll.props.refreshControl;
    assert.equal(refresh.type, s.native.RefreshControl);
    assert.equal(refresh.props.refreshing, refreshing);
    assert.equal(refresh.props.onRefresh, s.onRefresh);
    assert.equal(refresh.props.tintColor, '#E5A93C');
    assert.equal(refresh.props.colors[0], '#E5A93C');
    assert.equal(refresh.props.progressBackgroundColor, '#1B1B1F');
    assert.equal(s.scroll.props.alwaysBounceVertical, true);
    const recent = s.scroll.props.children.find(child => child.props.pronunciation);
    assert.equal(recent.props.pronunciation, s.pronunciation);
  }
});

test('Home omits Continue Listening without a replacement and preserves the other sections in order', () => {
  const s = setup(false);
  const children = s.scroll.props.children;
  assert.deepEqual(Array.from(children, child => child.type), [
    s.components.HomeHeader,
    s.components.QuickAddWord,
    s.components.WordsReadyForAudioCard,
    s.components.RecentWordsSection,
    s.components.HomeListeningStats,
  ]);
  assert.equal(children[3].props.pronunciation, s.pronunciation);
});
