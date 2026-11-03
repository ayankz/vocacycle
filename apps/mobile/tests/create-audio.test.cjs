const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./helpers/load-ts.cjs');
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)];
}
function hooks() {
  let cursor = 0; const slots = [];
  return { reset: () => { cursor = 0; }, useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; } };
}
function setup() {
  const hook = hooks(), generated = [], routes = [];
  const state = { words: [{ id: 27, text: 'bike' }, { id: 29, text: 'glasses' }], loading: false, refreshing: false, error: null, refresh() {} };
  const params = { wordIds: '[29,27,29]' }; const creation = { busy: false, error: null, generate: settings => generated.push(settings) };
  const Screen = createLoader({
    react: { useState: hook.useState },
    'react-native': { Alert: { alert() {} }, View: 'view', ScrollView: 'scroll', Pressable: 'button', RefreshControl: 'refresh', Switch: 'switch', StyleSheet: { create: v => v } },
    'expo-router': { useLocalSearchParams: () => params, router: { navigate: route => routes.push(route), replace() {} } },
    'react-native-screens/experimental': { SafeAreaView: 'safe' },
    '@/shared/ui/AppText': { AppText: 'text' }, '@/shared/icons/ArrowRightIcon': { ArrowRightIcon: 'arrow' }, '@/shared/icons/ProfileIcon': { ProfileIcon: 'profile' },
    '@/features/vocabulary/hooks/use-vocabulary-words': { useVocabularyWords: () => state },
    '../hooks/use-create-session': { useCreateSession: () => creation },
  })('src/features/audio/components/CreateAudioScreen.tsx').CreateAudioScreen;
  return { render: () => { hook.reset(); return Screen(); }, generated, routes, state, params, creation };
}
const button = (tree, label) => nodes(tree).find(n => n.props.accessibilityLabel === label);
test('configuration uses real selected words, defaults to five examples, and sends actual toggle settings', () => {
  const s = setup(); let tree = s.render();
  const text = nodes(tree).filter(n => n.type === 'text').flatMap(n => [n.props.children].flat()).filter(v => typeof v === 'string').join(' ');
  assert.match(text, /bike/); assert.match(text, /glasses/); assert.doesNotMatch(text, /Alex|45 seconds|18 min/);
  assert.equal(button(tree, '5 examples per word').props.accessibilityState.selected, true);
  button(tree, 'Generate Audio').props.onPress(); assert.deepEqual(Array.from(s.generated[0].wordIds), [29, 27]); assert.equal(s.generated[0].examplesPerWord, 5);
  button(tree, '7 examples per word').props.onPress(); tree = s.render();
  button(tree, 'Word translation').props.onValueChange(false); button(tree, 'Translate example sentences').props.onValueChange(true); tree = s.render();
  button(tree, 'Generate Audio').props.onPress();
  assert.equal(s.generated[1].examplesPerWord, 7); assert.equal(s.generated[1].includeWordTranslation, false); assert.equal(s.generated[1].includeExampleTranslations, true);
});
test('missing/deleted selection, loading, API error, >20 words and double-submit busy state disable Generate', () => {
  const s = setup();
  for (const update of [() => { s.state.loading = true; }, () => { s.state.loading = false; s.state.error = 'offline'; }, () => { s.state.error = null; s.params.wordIds = '[999]'; }, () => { s.params.wordIds = '[]'; }, () => { s.params.wordIds = '[27]'; s.creation.busy = true; }]) {
    update(); assert.equal(button(s.render(), 'Generate Audio').props.disabled, true);
  }
  s.creation.busy = false; s.params.wordIds = JSON.stringify(Array.from({ length: 21 }, (_, i) => i + 1));
  s.state.words = Array.from({ length: 21 }, (_, i) => ({ id: i + 1, text: `word${i}` }));
  assert.equal(button(s.render(), 'Generate Audio').props.disabled, true);
});
test('Edit passes serializable current IDs back to Vocabulary selection mode', () => {
  const s = setup(); button(s.render(), 'Edit selected words').props.onPress();
  assert.equal(s.routes[0].pathname, '/vocabulary'); assert.equal(s.routes[0].params.mode, 'select'); assert.equal(s.routes[0].params.wordIds, '[29,27]');
});
test('Vocabulary Continue navigates to configuration with IDs instead of a placeholder alert', () => {
  const calls = [];
  const tree = createLoader({ 'expo-router': { router: { navigate: route => calls.push(route) } }, '@/features/vocabulary/components/VocabularyScreen': { VocabularyScreen: 'vocabulary' } })('src/app/vocabulary.tsx').default();
  tree.props.onContinue([29, 27]); assert.equal(calls[0].pathname, '/audio/create'); assert.equal(calls[0].params.wordIds, '[29,27]');
});


test('refreshing disables submission without falsely claiming valid selected words are unavailable', () => {
  const s = setup(); s.state.refreshing = true; const tree = s.render();
  assert.equal(button(tree, 'Generate Audio').props.disabled, true);
  assert.equal(nodes(tree).some(n => n.type === 'text' && typeof n.props.children === 'string' && n.props.children.includes('Choose 1–20')), false);
});


test('loading or failed vocabulary does not present an unknown selected-word/example count as zero', () => {
  const s = setup(); s.state.words = []; s.state.loading = true;
  let texts = nodes(s.render()).filter(n => n.type === 'text');
  assert.equal(texts.some(n => n.props.children === 0 || n.props.children === '0'), false);
  assert.ok(texts.some(n => n.props.children === '…'));
  s.state.loading = false; s.state.error = 'offline'; texts = nodes(s.render()).filter(n => n.type === 'text');
  assert.equal(texts.some(n => n.props.children === 0 || n.props.children === '0'), false);
});
