const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./helpers/load-ts.cjs');

function setup() {
  const values = [], refs = [], effects = [], cancellations = [];
  let cursor = 0, refCursor = 0, deleted = 0, closed = 0, opens = 0;
  const load = createLoader({
    react: {
      useRef(initial) { return refs[refCursor++] ??= { current: initial }; },
      useEffect(fn) { effects.push(fn); },
    },
    'react-native': { View: 'view', Pressable: 'pressable', StyleSheet: { create: value => value } },
    'react-native-reanimated': {
      __esModule: true, default: { View: 'animated-view' }, ReduceMotion: { System: 'system' },
      useSharedValue(initial) { return values[cursor++] ??= { value: initial }; },
      useAnimatedStyle(fn) { return fn; },
      withTiming(to, config) { return { type: 'timing', to, config }; },
      withDelay(delay, animation, reduceMotion) { return { type: 'delay', delay, animation, reduceMotion }; },
      cancelAnimation: value => cancellations.push(value),
    },
    'react-native-gesture-handler/ReanimatedSwipeable': { __esModule: true, default: 'swipeable' },
    '@/shared/icons/TrashIcon': { TrashIcon: 'trash-icon' },
    '@/shared/ui/AppText': { AppText: 'text' },
    './RecentWordRow': { RecentWordRow: 'word-row' },
  });
  const { SwipeableWordRow } = load('src/features/home/components/SwipeableWordRow.tsx');
  const render = deleting => {
    cursor = 0; refCursor = 0; effects.length = 0;
    const tree = SwipeableWordRow({
      word: { id: '27', word: 'bike' }, playback: 'playing', onPronounce() {},
      onDelete() { deleted++; }, deleting, deleteDisabled: false,
      swipes: { open() { opens++; }, dispose() {} },
    });
    refs[0].current = { close() { closed++; } };
    return tree;
  };
  return { render, effects, values, cancellations, get deleted() { return deleted; }, get closed() { return closed; }, get opens() { return opens; } };
}

test('Delete dissolves/scales for 200ms and overlaps height/spacing collapse for a total 350ms', () => {
  const s = setup(); const tree = s.render(true); const cleanup = s.effects[0]();
  const [opacity, scale, fraction] = s.values;
  assert.equal(opacity.value.to, 0); assert.equal(opacity.value.config.duration, 200);
  assert.equal(scale.value.to, 0.96); assert.equal(scale.value.config.duration, 200);
  assert.equal(fraction.value.delay, 100); assert.equal(fraction.value.animation.config.duration, 250);
  assert.equal(fraction.value.animation.to, 0);
  assert.equal(fraction.value.reduceMotion, 'system'); assert.equal(opacity.value.config.reduceMotion, 'system');
  assert.equal(tree.props.pointerEvents, 'none'); assert.equal(tree.props.accessibilityElementsHidden, true);
  assert.equal(s.closed, 1); cleanup(); assert.equal(s.cancellations.length, 3);
});

test('Undo expands and fades in using the same row values; measured height and spacing animate together', () => {
  const s = setup(); s.render(true); s.effects[0]();
  const tree = s.render(false); s.effects[0]();
  assert.equal(s.values[0].value.delay, 50); assert.equal(s.values[0].value.animation.to, 1);
  assert.equal(s.values[1].value.to, 1); assert.equal(s.values[2].value.animation.to, 1);
  // The style uses the same shared fraction for both the row and its spacing.
  s.values[0].value = 0.5; s.values[1].value = 0.98; s.values[2].value = 0.5; s.values[3].value = 100;
  const style = tree.props.style[1]();
  assert.equal(style.height, 50); assert.equal(style.marginBottom, 4);
  assert.equal(style.opacity, 0.5); assert.equal(tree.props.pointerEvents, 'auto');
});

test('left swipe reveals the explicit Delete action and never automatically deletes on full swipe', () => {
  const s = setup(); const tree = s.render(false);
  const swipe = tree.props.children.props.children;
  assert.equal(swipe.props.overshootRight, false); assert.equal(swipe.props.renderLeftActions, undefined);
  swipe.props.onSwipeableOpenStartDrag(); swipe.props.onSwipeableWillOpen();
  assert.equal(s.opens, 2); assert.equal(s.deleted, 0);
  assert.equal(swipe.props.onSwipeableOpen, undefined);
  const action = swipe.props.renderRightActions();
  assert.equal(action.props.accessibilityLabel, 'Delete bike'); action.props.onPress();
  assert.equal(s.deleted, 1);
});

test('only one swipe row remains open and unmounting an old row does not clear the new one', () => {
  const { SwipeRowCoordinator } = createLoader()('src/features/home/data/swipe-row-coordinator.ts');
  const swipes = new SwipeRowCoordinator(); let first = 0, second = 0;
  swipes.open('27', () => first++); swipes.open('28', () => second++);
  assert.equal(first, 1); swipes.dispose('27');
  swipes.open('29', () => {}); assert.equal(second, 1);
});
