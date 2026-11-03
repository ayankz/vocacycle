const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const createLoader = require('./helpers/load-ts.cjs');
const load = createLoader({
  'react-native': {
    StyleSheet: { create: v => v },
    View: ({ children, accessibilityLabel, accessibilityHint }) => React.createElement('div', { 'aria-label': accessibilityLabel, title: accessibilityHint }, children),
  },
  '@/shared/ui/AppText': { AppText: ({ children }) => React.createElement('span', null, children) },
});
const { HomeListeningStats } = load('src/features/home/components/HomeListeningStats.tsx');
const render = (wordsSaved, extra = {}, metrics = {}) => renderToStaticMarkup(React.createElement(HomeListeningStats, {
  statistics: { wordsSaved, sessions: null, listenedMinutes: null, ...metrics }, ...extra,
}));

test('real saved count and unavailable metrics replace demo totals', () => {
  const html = render(30);
  assert.match(html, /30 words saved/);
  assert.match(html, /Unavailable sessions/); assert.match(html, /Unavailable listened/);
  assert.equal((html.match(/—/g) || []).length, 2);
  assert.doesNotMatch(html, /127|4h 32m|8 sessions/);
});

test('loading and failed unknown counts never appear as a confirmed zero', () => {
  const loading = render(null, { loading: true });
  assert.match(loading, /Loading words saved/); assert.match(loading, /…/);
  assert.doesNotMatch(loading, /0 words saved/);
  const failed = render(null, { error: 'offline' });
  assert.match(failed, /Unavailable words saved/); assert.match(failed, /Could not refresh/);
  assert.doesNotMatch(failed, /0 words saved|stale/);
});

test('confirmed zero, stale zero, duration formatting and recovery are distinct', () => {
  assert.match(render(0), /0 words saved/);
  const stale = render(0, { error: 'offline' });
  assert.match(stale, /0 words saved \(stale\)/); assert.match(stale, /Pull to refresh/);
  assert.match(render(30, { error: 'offline' }), /30 words saved \(stale\)/);
  assert.doesNotMatch(render(31), /stale/);
  const zero = render(0, {}, { sessions: 0, listenedMinutes: 0 });
  assert.match(zero, /0 sessions/); assert.match(zero, /0m listened/);
  assert.match(render(1, {}, { listenedMinutes: 65 }), /1h 5m listened/);
});

test('Home uses the existing count and distinguishes failed initial load from cached zero', () => {
  const state = { recentWords: [], totalWordCount: 0, wordsLoading: false, wordsLoaded: false, wordsError: 'offline', onRefresh() {} };
  const mocks = {
    'react-native': { ScrollView: 'scroll', RefreshControl: 'refresh', StyleSheet: { create: v => v } },
    'react-native-safe-area-context': { SafeAreaView: 'safe' },
    'expo-router': { router: {} },
    '@/features/home/hooks/use-recent-words': { useRecentWords: () => state },
    '@/features/home/hooks/use-word-pronunciation': { useWordPronunciation: () => ({}) },
  };
  for (const name of ['HomeHeader', 'QuickAddWord', 'WordsReadyForAudioCard', 'RecentWordsSection', 'HomeListeningStats']) {
    mocks[`@/features/home/components/${name}`] = { [name]: name };
  }
  const Home = createLoader(mocks)('src/app/index.tsx').default;
  const props = () => Home().props.children[0].props.children.at(-1).props;
  assert.equal(props().statistics.wordsSaved, null);
  state.wordsLoaded = true;
  assert.equal(props().statistics.wordsSaved, 0);
  for (const count of [30, 31, 30, 31]) {
    state.totalWordCount = count; assert.equal(props().statistics.wordsSaved, count);
  }
  assert.equal(props().statistics.sessions, null); assert.equal(props().statistics.listenedMinutes, null);
  assert.equal(props().error, 'offline');
  state.wordsLoading = true;
  assert.equal(props().loading, true); assert.equal(props().statistics.wordsSaved, null);
});
