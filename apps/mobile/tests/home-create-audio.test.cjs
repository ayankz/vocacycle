const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const createLoader = require('./helpers/load-ts.cjs');
const native = {
  StyleSheet: { create: v => v, absoluteFill: {} },
  View: ({ children }) => React.createElement('div', null, children),
  Pressable: ({ children, accessibilityLabel, disabled, onPress }) => React.createElement('button', { 'aria-label': accessibilityLabel, disabled, onClick: onPress }, children),
};
const load = createLoader({
  'react-native': native,
  'react-native-svg': { __esModule: true, ...Object.fromEntries(['default', 'Defs', 'LinearGradient', 'Rect', 'Stop'].map(k => [k, () => null])) },
  '@/shared/ui/AppText': { AppText: ({ children }) => React.createElement('span', null, children) },
  '@/shared/icons/ArrowRightIcon': { ArrowRightIcon: () => null },
});
const { WordsReadyForAudioCard: Card } = load('src/features/home/components/WordsReadyForAudioCard.tsx');
const render = props => renderToStaticMarkup(React.createElement(Card, { onCreateAudio() {}, ...props }));

test('Home CTA distinguishes unknown/loading, failed, empty and real nonempty counts', () => {
  const loading = render({ wordCount: 0, loading: true });
  assert.match(loading, /Loading vocabulary/); assert.doesNotMatch(loading, /0 words/); assert.match(loading, /disabled/);
  const failed = render({ wordCount: 30, error: 'offline' });
  assert.match(failed, /Vocabulary unavailable/); assert.match(failed, /Try again/); assert.doesNotMatch(failed, /30 words/);
  const empty = render({ wordCount: 0 });
  assert.match(empty, /Add your first word/); assert.match(empty, /disabled/);
  assert.match(render({ wordCount: 1 }), /1 word ready for audio/);
  const ready = render({ wordCount: 30 });
  assert.match(ready, /30 words ready for audio/); assert.doesNotMatch(ready, /disabled/);
});

test('Home forwards live count/loading/error and navigates to Vocabulary selection, never configuration', () => {
  const calls = [];
  const components = {};
  const state = { recentWords: [], totalWordCount: 30, wordsLoading: false, wordsRefreshing: false, wordsError: null, onRefresh() {}, onAdded() {} };
  const mocks = {
    'react-native': { ...native, ScrollView: 'scroll', RefreshControl: 'refresh' },
    'react-native-safe-area-context': { SafeAreaView: 'safe' },
    'expo-router': { router: { navigate: value => calls.push(value) } },
    '@/features/home/hooks/use-recent-words': { useRecentWords: () => state },
    '@/features/home/hooks/use-word-pronunciation': { useWordPronunciation: () => ({}) },
  };
  for (const name of ['HomeHeader', 'QuickAddWord', 'WordsReadyForAudioCard', 'RecentWordsSection', 'HomeListeningStats']) {
    components[name] = name;
    mocks[`@/features/home/components/${name}`] = { [name]: name };
  }
  const Home = createLoader(mocks)('src/app/index.tsx').default;
  const card = () => Home().props.children[0].props.children[2];
  assert.equal(card().props.wordCount, 30);
  card().props.onCreateAudio();
  assert.equal(calls[0].pathname, '/vocabulary'); assert.equal(calls[0].params.mode, 'select');
  for (const count of [31, 30, 31, 0]) { state.totalWordCount = count; assert.equal(card().props.wordCount, count); }
  state.wordsLoading = true; assert.equal(card().props.loading, true);
  state.wordsError = 'offline'; assert.equal(card().props.error, 'offline');
  assert.equal(card().props.onRetry, state.onRefresh);
});
