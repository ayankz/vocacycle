const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./helpers/load-ts.cjs');

const words = [
  { id: 27, text: 'bike', translation: 'велосипед', ipa: null, pronunciationAudioUrl: null },
  { id: 29, text: 'glasses', translation: null, ipa: '/ɡlæsɪz/' },
];

test('selection toggles, bulk selection toggles and handoff excludes duplicates/deleted/invalid IDs', () => {
  const { validSelection, toggleSelection, selectAll } = createLoader()('src/features/vocabulary/data/selection.ts');
  let ids = toggleSelection(new Set(), 27);
  assert.deepEqual([...ids], [27]);
  assert.deepEqual([...toggleSelection(ids, 27)], []);
  ids = selectAll(ids, words);
  assert.deepEqual([...ids], [27, 29]);
  assert.deepEqual([...selectAll(ids, words)], []);
  assert.deepEqual(Array.from(validSelection([27, 27, 29, 0, NaN, 1.5, 999], [words[1]])), [29]);
  assert.deepEqual([...selectAll(new Set([27]), [])], [27]);
});

function setup(mode = 'select') {
  const slots = [], effects = [];
  let cursor = 0, effectCursor = 0, focus;
  const state = { words, loading: false, refreshing: false, error: null, refresh() {} };
  const params = { mode };
  const calls = [], alerts = [];
  const native = { FlatList: 'list', View: 'view', Pressable: 'button', RefreshControl: 'refresh', StyleSheet: { create: v => v }, Alert: { alert: (...args) => alerts.push(args) } };
  const load = createLoader({
    react: {
      useState(initial) {
        const i = cursor++;
        if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
        return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
      },
      useEffect(fn, deps) {
        const i = effectCursor++;
        if (!effects[i] || deps.some((v, j) => v !== effects[i][j])) { effects[i] = deps; fn(); }
      },
      useCallback: fn => fn,
    },
    'react-native': native,
    'react-native-screens/experimental': { SafeAreaView: 'native-safe' },
    'expo-router': { useLocalSearchParams: () => params, useNavigation: () => ({ setParams: p => { calls.push(p); Object.assign(params, p); } }), useFocusEffect: fn => { focus = fn; }, router: { setParams: p => { calls.push(p); Object.assign(params, p); } } },
    '../hooks/use-vocabulary-words': { useVocabularyWords: () => state },
    '@/shared/ui/AppText': { AppText: 'text' },
    '@/shared/icons/CheckIcon': { CheckIcon: 'check' },
    '@/shared/icons/ArrowRightIcon': { ArrowRightIcon: 'arrow' },
  });
  const Screen = load('src/features/vocabulary/components/VocabularyScreen.tsx').VocabularyScreen;
  const render = () => { cursor = 0; effectCursor = 0; return Screen({ onContinue: ids => calls.push(Array.from(ids)) }); };
  return { state, params, calls, alerts, render, blur: () => focus()() };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)];
}
const list = tree => nodes(tree).find(n => n.type === 'list');
const buttons = tree => nodes(tree).filter(n => n.type === 'button');
const action = tree => buttons(tree).at(-1);

test('real rows select and deselect, zero disables Continue; Select All and Cancel work', () => {
  const s = setup();
  let tree = s.render();
  assert.equal(action(tree).props.disabled, true);
  let row = list(tree).props.renderItem({ item: words[0] });
  assert.equal(row.props.accessibilityRole, 'checkbox');
  assert.equal(row.props.accessibilityState.checked, false);
  row.props.onPress(); tree = s.render();
  assert.equal(action(tree).props.disabled, false);
  assert.equal(list(tree).props.renderItem({ item: words[0] }).props.accessibilityState.checked, true);
  list(tree).props.renderItem({ item: words[0] }).props.onPress(); tree = s.render();
  assert.equal(action(tree).props.disabled, true);
  buttons(tree)[1].props.onPress(); tree = s.render();
  assert.equal(list(tree).props.renderItem({ item: words[1] }).props.accessibilityState.checked, true);
  buttons(tree)[1].props.onPress(); tree = s.render();
  assert.equal(action(tree).props.disabled, true);
  buttons(tree)[0].props.onPress(); tree = s.render();
  assert.equal(s.params.mode, undefined);
  assert.equal(list(tree).props.renderItem({ item: words[0] }).type, 'view');
});

test('refresh removes invalid selections, errors/loading block Continue and empty state is honest', () => {
  const s = setup(); let tree = s.render();
  buttons(tree)[1].props.onPress(); s.render();
  s.state.words = [words[1]]; tree = s.render();
  assert.equal(action(tree).props.disabled, false);
  s.state.error = 'offline'; tree = s.render();
  assert.equal(action(tree).props.disabled, true);
  s.state.error = null; s.state.words = []; tree = s.render();
  assert.equal(action(tree).props.disabled, true);
  assert.match(JSON.stringify(list(tree).props.ListEmptyComponent), /No saved words/);
  s.state.loading = true; tree = s.render();
  assert.match(JSON.stringify(list(tree).props.ListEmptyComponent), /Loading vocabulary/);
});

test('leaving selection clears mode; ordinary browsing has no selection controls', () => {
  const s = setup(); s.render(); s.blur();
  assert.equal(s.params.mode, undefined);
  const tree = s.render();
  assert.equal(buttons(tree).length, 1);
});


test('Continue hands off only current valid IDs and retains selection for editing', () => {
  const s = setup(); let tree = s.render();
  action(tree).props.onPress(); assert.equal(s.calls.length, 0);
  buttons(tree)[1].props.onPress(); tree = s.render();
  s.state.words = [words[1]]; tree = s.render();
  action(tree).props.onPress();
  assert.deepEqual(s.calls[0], [29]);
  assert.equal(list(s.render()).props.renderItem({ item: words[1] }).props.accessibilityState.checked, true);
  s.state.words = words; tree = s.render();
  assert.equal(list(tree).props.renderItem({ item: words[0] }).props.accessibilityState.checked, false);
});


test('native safe area protects the in-flow action bar; list does not double inset or overlay its last row', () => {
  const s = setup(); const tree = s.render();
  assert.equal(tree.type, 'native-safe');
  assert.equal(tree.props.edges.top, true);
  assert.equal(tree.props.edges.bottom, true);
  const scroll = list(tree);
  assert.equal(scroll.props.contentInsetAdjustmentBehavior, 'never');
  assert.equal(scroll.props.automaticallyAdjustContentInsets, false);
  assert.equal(scroll.props.style.flex, 1);
  assert.ok(scroll.props.contentContainerStyle.paddingBottom > 0);
  assert.equal(scroll.props.contentContainerStyle.position, undefined);
  const children = tree.props.children;
  const footer = children.at(-1);
  assert.ok(children.indexOf(scroll) < children.indexOf(footer));
  assert.equal(footer.props.style.position, undefined);
  assert.ok(footer.props.style.margin > 0);
});

test('Vocabulary alone opts out of native automatic scroll insets', () => {
  function NativeTabs() {}
  NativeTabs.Trigger = 'trigger';
  NativeTabs.Trigger.Label = 'label'; NativeTabs.Trigger.Icon = 'icon';
  const load = createLoader({ 'expo-router/native-tabs': { NativeTabs } });
  const tabs = load('src/components/app-tabs.tsx').default().props.children;
  assert.equal(tabs.find(tab => tab.props.name === 'vocabulary').props.disableAutomaticContentInsets, true);
  assert.equal(tabs.find(tab => tab.props.name === 'index').props.disableAutomaticContentInsets, undefined);
});
