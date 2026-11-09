const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./helpers/load-ts.cjs');
function nodes(tree) { return tree && typeof tree === 'object' ? [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)] : []; }
function setup() {
  const state = { session: { id: 7, status: 'ready', stage: 'ready', words: [{ wordId: 27, text: 'bike' }], wordIds: [27], examplesPerWord: 5, durationMs: 62000, audioUrl: '/audio-sessions/7/audio' }, loading: false, paused: false, error: null, refresh() {} };
  const calls = [];
  const Screen = createLoader({
    react: { useCallback: fn => fn },
    'expo-router': { useFocusEffect() {}, router: { replace() {}, navigate() {}, push: route => calls.push(route) } },
    'react-native-svg': { __esModule: true, default: 'svg', Circle: 'circle', Path: 'path' },
    'react-native': { View: 'view', ScrollView: 'scroll', Pressable: 'button', StyleSheet: { create: v => v } },
    'react-native-screens/experimental': { SafeAreaView: 'safe' },
    '@/shared/ui/AppText': { AppText: 'text' }, '@/shared/icons/CheckIcon': { CheckIcon: 'check' },
    '@/features/home/components/PronunciationSpinner': { PronunciationSpinner: 'spinner' },
    '../hooks/use-session-status': { useSessionStatus: () => state },
  })('src/features/audio/components/AudioSessionScreen.tsx').AudioSessionScreen;
  return { state, calls, render: () => Screen({ id: 7, view: 'ready' }) };
}
test('Audio Ready opens the player for real returned audio and shows measured duration', () => {
  const s = setup(); const tree = s.render();
  nodes(tree).find(n => n.props.accessibilityLabel === 'Play Audio Now').props.onPress();
  assert.equal(s.calls[0].pathname, '/audio/player/[id]');
  assert.equal(s.calls[0].params.id, '7');
  assert.ok(nodes(tree).some(n => n.type === 'text' && JSON.stringify(n.props.children).includes('1m 2s')));
  s.state.session.audioUrl = null;
  assert.equal(nodes(s.render()).find(n => n.props.accessibilityLabel === 'Play Audio Now').props.disabled, true);
});
test('real generation errors and paused status checks never advertise playback or fake completion', () => {
  const s = setup(); s.state.session.status = 'failed'; s.state.session.error = 'Provider quota exceeded';
  let tree = s.render(); assert.equal(nodes(tree).some(n => n.props.accessibilityLabel === 'Play Audio Now'), false);
  assert.ok(nodes(tree).some(n => n.props.accessibilityRole === 'alert' && n.props.children === 'Provider quota exceeded'));
  s.state.session.status = 'processing'; s.state.paused = true; tree = s.render();
  assert.equal(nodes(tree).some(n => n.type === 'spinner'), false);
  assert.ok(nodes(tree).some(n => n.type === 'text' && typeof n.props.children === 'string' && n.props.children.includes('Automatic status checks paused')));
});
