const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const createLoader = require('./helpers/load-ts.cjs');

const load = createLoader({
  'react-native': {
    StyleSheet: { create: value => value },
    View: ({ children }) => React.createElement('div', null, children),
    Pressable: ({ children, accessibilityLabel, accessibilityState, disabled }) => React.createElement('button', {
      'aria-label': accessibilityLabel, 'aria-busy': accessibilityState?.busy, 'aria-selected': accessibilityState?.selected, disabled,
    }, children),
    ActivityIndicator: () => React.createElement('span', { role: 'progressbar' }),
  },
  '@/shared/ui/AppText': { AppText: ({ children }) => React.createElement('span', null, children) },
  '@/shared/icons/PlayIcon': { PlayIcon: () => React.createElement('svg', { 'data-icon': 'play' }) },
});
const { RecentWordRow } = load('src/features/home/components/RecentWordRow.tsx');
const word = { id: '23', word: 'apple', phonetic: '/ˈæp.əl/', translation: 'яблоко' };
const render = (pronunciationAudioUrl, playback = 'idle') => renderToStaticMarkup(React.createElement(RecentWordRow, {
  word: { ...word, pronunciationAudioUrl }, onPronounce() {}, playback,
}));

test('null, undefined, empty or whitespace audio URLs render no control, spinner or reserved control spacing', () => {
  for (const pronunciationAudioUrl of [null, undefined, '', ' ']) {
    const html = render(pronunciationAudioUrl, 'loading');
    assert.doesNotMatch(html, /<button|<svg|progressbar/);
    assert.match(html, /apple/);
    const tree = RecentWordRow({ word: { ...word, pronunciationAudioUrl }, onPronounce() {} });
    const copyStyle = Object.assign({}, ...tree.props.children[0].props.style.filter(Boolean));
    assert.equal(copyStyle.paddingRight, undefined);
  }
});

test('available audio renders the existing play control', () => {
  const html = render('/words/23/pronunciation');
  assert.match(html, /aria-label="Play pronunciation of apple"/); assert.match(html, /data-icon="play"/);
  assert.doesNotMatch(html, /progressbar|disabled=""/);
});

test('loading shows a busy spinner while remaining tappable', () => {
  const html = render('/words/23/pronunciation', 'loading');
  assert.match(html, /progressbar/); assert.match(html, /aria-busy="true"/); assert.doesNotMatch(html, /disabled=""/);
  assert.doesNotMatch(html, /data-icon="play"/);
  assert.doesNotMatch(render('/words/24/pronunciation'), /progressbar/);
});

test('playing control exposes replay state and remains tappable', () => {
  const html = render('/words/23/pronunciation', 'playing');
  assert.match(html, /aria-label="Replay pronunciation of apple"/); assert.match(html, /aria-selected="true"/);
  assert.doesNotMatch(html, /disabled=""/);
});
