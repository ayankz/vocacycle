const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const createLoader = require('./helpers/load-ts.cjs');

function setup(reduceMotion = false) {
  const effects = [], timings = [], loops = [];
  let listener, removed = false;
  const linear = value => value;
  const load = createLoader({
    react: { useState: initial => [initial(), () => {}], useEffect: fn => effects.push(fn) },
    'react-native': {
      StyleSheet: { create: value => value }, Easing: { linear },
      Animated: {
        View: ({ children, testID }) => React.createElement('div', { 'data-testid': testID }, children),
        Value: class { setValue() {} interpolate() { return '0deg'; } },
        timing(value, config) { timings.push(config); return { config }; },
        loop(animation) {
          const loop = { animation, started: false, stopped: false, start() { this.started = true; }, stop() { this.stopped = true; } };
          loops.push(loop); return loop;
        },
      },
      AccessibilityInfo: {
        isReduceMotionEnabled: async () => reduceMotion,
        addEventListener(event, fn) { assert.equal(event, 'reduceMotionChanged'); listener = fn; return { remove() { removed = true; } }; },
      },
    },
    'react-native-svg': {
      __esModule: true,
      default: ({ children, ...props }) => React.createElement('svg', props, children),
      Circle: props => React.createElement('circle', props),
      Path: props => React.createElement('path', props),
    },
  });
  const tree = load('src/features/home/components/PronunciationSpinner.tsx').PronunciationSpinner();
  return { tree, timings, loops, linear, mount: () => effects[0](), motion: value => listener(value), get removed() { return removed; } };
}

test('compact generation spinner has a dark circle, charcoal track and short amber arc', () => {
  const s = setup();
  const html = renderToStaticMarkup(s.tree);
  const style = Object.assign({}, ...s.tree.props.style);
  assert.equal(style.width, 32); assert.equal(style.height, 32);
  assert.equal(style.borderRadius, 16); assert.equal(style.backgroundColor, '#1B1B1F');
  assert.match(html, /<circle[^>]*stroke="#34353C"/);
  assert.match(html, /<path[^>]*d="M16 6 A10 10 0 0 1 26 16"[^>]*stroke="#E5A93C"/);
  assert.match(html, /stroke-linecap="round"/);
  assert.doesNotMatch(html, /progressbar|aria-valuenow|aria-valuemax|<progress|%/);
});

test('generation spinner rotates linearly on the native driver and stops on unmount', async () => {
  const s = setup(); const cleanup = s.mount(); await Promise.resolve();
  assert.equal(s.loops.length, 1); assert.equal(s.loops[0].started, true);
  assert.equal(s.timings[0].duration, 1000); assert.equal(s.timings[0].toValue, 1);
  assert.equal(s.timings[0].easing, s.linear);
  assert.equal(s.timings[0].useNativeDriver, true); assert.equal(s.timings[0].isInteraction, false);
  cleanup(); assert.equal(s.loops[0].stopped, true); assert.equal(s.removed, true);
});

test('spinner respects Reduce Motion and ignores preference resolution after unmount', async () => {
  const s = setup(true); const cleanup = s.mount(); await Promise.resolve();
  assert.equal(s.loops.length, 0);
  s.motion(false); assert.equal(s.loops[0].started, true);
  s.motion(true); assert.equal(s.loops[0].stopped, true); cleanup();
  const late = setup(); const dispose = late.mount(); dispose(); await Promise.resolve();
  assert.equal(late.loops.length, 0); assert.equal(late.removed, true);
});
