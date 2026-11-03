const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./helpers/load-ts.cjs');
const load = createLoader({
  'react-native': { Pressable: 'button', View: 'view', ScrollView: 'scroll', TextInput: 'input', StyleSheet: { create: v => v } },
  '@/shared/icons/SearchIcon': { SearchIcon: 'search' },
  '@/shared/ui/AppText': { AppText: 'text' },
});
const { VocabularyControls } = load('src/features/vocabulary/components/VocabularyControls.tsx');
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)];
}
const render = extra => VocabularyControls({ query: '', onQueryChange() {}, filter: 'all', onFilterChange() {}, count: 30, notInAudioCount: 12, loading: false, ...extra });

test('search, clear and chips use real counts and controlled callbacks', () => {
  const changes = [], filters = [];
  const tree = render({ query: 'bike', onQueryChange: q => changes.push(q), onFilterChange: f => filters.push(f) });
  const elements = nodes(tree);
  elements.find(n => n.type === 'input').props.onChangeText('очки');
  elements.find(n => n.props.accessibilityLabel === 'Clear search').props.onPress();
  assert.deepEqual(changes, ['очки', '']);
  const all = elements.find(n => n.props.accessibilityLabel === 'All (30)');
  assert.equal(all.props.accessibilityState.selected, true);
  const notInAudio = elements.find(n => n.props.accessibilityLabel === 'Not in Audio (12)');
  assert.equal(notInAudio.props.disabled, false); notInAudio.props.onPress();
  assert.deepEqual(filters, ['not-in-audio']);
  assert.ok(elements.find(n => n.props.accessibilityLabel === 'Recent'));
});

test('unknown membership disables its chip, loading is distinct from a real zero', () => {
  let elements = nodes(render({ count: null, notInAudioCount: null }));
  assert.equal(elements.find(n => n.props.accessibilityLabel === 'Not in Audio (—)').props.disabled, true);
  assert.ok(elements.find(n => n.props.accessibilityLabel === 'All (—)'));
  elements = nodes(render({ count: 0, notInAudioCount: 0 }));
  assert.equal(elements.find(n => n.props.accessibilityLabel === 'Not in Audio (0)').props.disabled, false);
  assert.ok(elements.find(n => n.props.accessibilityLabel === 'All (0)'));
  elements = nodes(render({ loading: true }));
  assert.equal(elements.find(n => n.props.accessibilityLabel === 'Not in Audio (…)').props.disabled, true);
});
