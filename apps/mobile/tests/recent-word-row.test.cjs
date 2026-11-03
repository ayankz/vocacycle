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
  '@/shared/ui/AppText': { AppText: ({ children, color }) => React.createElement('span', { style: { color } }, children) },
  './PronunciationSpinner': { PronunciationSpinner: () => React.createElement('span', { 'data-generation-spinner': true }) },
  './PronunciationVisual': { PronunciationVisual: ({ children, playing }) => playing ? React.createElement('span', { 'data-bars': true }) : children },
  '@/shared/icons/AudioUnavailableIcon': { AudioUnavailableIcon: () => React.createElement('svg', { 'data-icon': 'unavailable' }) },
  '@/shared/icons/PlayIcon': { PlayIcon: () => React.createElement('svg', { 'data-icon': 'play' }) },
});
const { RecentWordRow } = load('src/features/home/components/RecentWordRow.tsx');
const word = { id: '23', word: 'apple', phonetic: '/ˈæp.əl/', translation: 'яблоко' };
const render = (pronunciationAudioUrl, playback = 'idle') => renderToStaticMarkup(React.createElement(RecentWordRow, {
  word: { ...word, pronunciationAudioUrl }, onPronounce() {}, playback,
}));

test('missing audio renders a neutral disabled icon and unavailable label', () => {
  for (const url of [null, undefined, '', ' ']) {
    const html = render(url, 'loading');
    assert.match(html, /disabled=""/);
    assert.match(html, /Audio unavailable/);
    assert.match(html, /data-icon="unavailable"/);
    assert.doesNotMatch(html, /progressbar/);
  }
});

test('generating retains translation and uses an indeterminate spinner', () => {
  const html = renderToStaticMarkup(React.createElement(RecentWordRow, {
    word: { ...word, pronunciationStatus: 'generating' }, onPronounce() {},
  }));
  assert.match(html, /Generating audio…/);
  assert.match(html, /яблоко/);
  assert.match(html, /data-generation-spinner/);
  assert.doesNotMatch(html, /progressbar/);
  assert.match(html, /disabled=""/);
  assert.doesNotMatch(html, /%/);
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

test('playing word text is amber; completion and switching restore normal text and outline', () => {
  assert.match(render('/words/23/pronunciation', 'playing'), /color:#E5A93C[^>]*>apple/);
  assert.match(render('/words/23/pronunciation', 'playing'), /data-bars="true"/);
  assert.doesNotMatch(render('/words/23/pronunciation'), /color:#E5A93C[^>]*>apple|data-bars/);
  const tree = phase => RecentWordRow({ word: { ...word, pronunciationAudioUrl: '/words/23/pronunciation' }, playback: phase, onPronounce() {} });
  const border = phase => Object.assign({}, ...tree(phase).props.style.filter(Boolean)).borderColor;
  assert.notEqual(border('playing'), border('idle'));
  assert.equal(border('loading'), border('idle'));
});

test('availability mapping keeps the row generating beyond 60 seconds and exposes playback when audio arrives', () => {
  const { pronunciationAvailability } = load('src/features/home/data/pronunciation-status.ts');
  const row = audioUrl => renderToStaticMarkup(React.createElement(RecentWordRow, {
    word: { ...word, pronunciationAudioUrl: audioUrl, pronunciationStatus: pronunciationAvailability(audioUrl, 62) },
    onPronounce() {},
  }));
  const pending = row(null);
  assert.match(pending, /Generating audio…/);
  assert.match(pending, /data-generation-spinner/);
  assert.match(pending, /disabled=""/);
  assert.doesNotMatch(pending, /Audio unavailable/);
  const ready = row('/words/23/pronunciation');
  assert.match(ready, /aria-label="Play pronunciation of apple"/);
  assert.match(ready, /яблоко/);
  assert.doesNotMatch(ready, /Generating audio…|Audio unavailable|data-generation-spinner|progressbar|disabled=""/);
});

test('ready audio remains tappable and loading/playing work without IPA', () => {
  for (const playback of ['idle', 'loading', 'playing']) {
    const html = renderToStaticMarkup(React.createElement(RecentWordRow, {
      word: { ...word, phonetic: null, pronunciationAudioUrl: '/words/23/pronunciation', pronunciationStatus: 'ready' },
      playback, onPronounce() {},
    }));
    assert.doesNotMatch(html, /Generating audio…|Audio unavailable|disabled=""/);
    assert.match(html, /яблоко/);
    if (playback === 'idle') assert.match(html, /data-icon="play"/);
    if (playback === 'loading') assert.match(html, /progressbar/);
    if (playback === 'playing') assert.match(html, /color:#E5A93C[^>]*>apple/);
  }
});

test('an arriving audio URL immediately replaces the generation spinner even if status is stale', () => {
  const html = renderToStaticMarkup(React.createElement(RecentWordRow, {
    word: { ...word, pronunciationAudioUrl: '/words/23/pronunciation', pronunciationStatus: 'generating' },
    onPronounce() {},
  }));
  assert.match(html, /aria-label="Play pronunciation of apple"/);
  assert.match(html, /data-icon="play"/);
  assert.doesNotMatch(html, /Generating audio…|data-generation-spinner|disabled=""/);
});

test('VoiceOver exposes Delete on the word text without hiding the playback control', () => {
  let deleted = 0;
  const tree = RecentWordRow({ word: { ...word, pronunciationAudioUrl: '/words/23/pronunciation' }, onPronounce() {}, onDelete() { deleted++; } });
  const title = tree.props.children[0].props.children[0].props.children[0];
  assert.equal(title.props.accessibilityActions[0].label, 'Delete apple');
  title.props.onAccessibilityAction({ nativeEvent: { actionName: 'delete' } }); assert.equal(deleted, 1);
  assert.equal(tree.props.children[1].props.accessibilityRole, 'button');
});
