const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./helpers/load-ts.cjs');
const { WordRemovalSnackbar } = createLoader({
  'react-native': { View: 'view', Pressable: 'pressable', StyleSheet: { create: value => value } },
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 83 }) },
  '@/shared/ui/AppText': { AppText: 'text' },
})('src/features/home/components/WordRemovalSnackbar.tsx');

test('snackbar exposes Word removed and Undo above the native tab/safe area, then removes Undo at expiry', () => {
  let undone = 0;
  const tree = WordRemovalSnackbar({ undoAvailable: true, busy: false, onUndo() { undone++; } });
  assert.equal(tree.props.children[0].props.children, 'Word removed');
  assert.equal(tree.props.children[1].props.accessibilityLabel, 'Undo word removal');
  assert.equal(tree.props.accessibilityLiveRegion, 'polite');
  assert.equal(Object.assign({}, ...tree.props.style).marginBottom, 91);
  tree.props.children[1].props.onPress(); assert.equal(undone, 1);
  const expired = WordRemovalSnackbar({ undoAvailable: false, busy: true, onUndo() {} });
  assert.equal(expired.props.children[1], false);
});
