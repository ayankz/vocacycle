const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./helpers/load-ts.cjs');

function setup(reduceMotion = false) {
  const effects = [], animations = [];
  let listener, removed = false;
  const animation = kind => {
    const value = { kind, started: false, stopped: false, start() { this.started = true; }, stop() { this.stopped = true; } };
    animations.push(value); return value;
  };
  const load = createLoader({
    react: { useState: init => [init(), () => {}], useEffect: fn => effects.push(fn) },
    'react-native': {
      StyleSheet: { create: value => value }, View: 'view',
      Animated: {
        View: 'animated-view', Value: class { setValue() {} interpolate() { return 0.5; } },
        timing: () => animation('timing'), sequence: () => animation('sequence'),
        loop: () => animation('loop'), parallel: () => animation('parallel'),
      },
      AccessibilityInfo: {
        isReduceMotionEnabled: async () => reduceMotion,
        addEventListener: (event, fn) => { listener = fn; return { remove() { removed = true; } }; },
      },
    },
  });
  load('src/features/home/components/PronunciationVisual.tsx').PronunciationVisual({ playing: true });
  return { animations, mount: () => effects[0](), motion: value => listener(value), get removed() { return removed; } };
}

test('audio bars stop their native animation and remove motion subscription on unmount', async () => {
  const s = setup(); const cleanup = s.mount(); await Promise.resolve();
  const active = s.animations.find(value => value.kind === 'parallel');
  assert.equal(active.started, true);
  cleanup(); assert.equal(active.stopped, true); assert.equal(s.removed, true);
});

test('reduce motion disables bars animation and late preference resolution is ignored after cleanup', async () => {
  const s = setup(true); const cleanup = s.mount(); await Promise.resolve();
  assert.equal(s.animations.length, 0);
  s.motion(false); assert.ok(s.animations.some(a => a.started));
  s.motion(true); assert.ok(s.animations.filter(a => a.started).every(a => a.stopped));
  cleanup();
  const late = setup(); const dispose = late.mount(); dispose(); await Promise.resolve();
  assert.equal(late.animations.length, 0);
});
