const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./helpers/load-ts.cjs');
function nodes(tree) { return tree && typeof tree === 'object' ? [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)] : []; }
function setup() {
  const state = { session: { id: 7, status: 'ready', stage: 'ready', words: [{ wordId: 27, text: 'bike' }], wordIds: [27], examplesPerWord: 5, durationMs: 62000, audioUrl: '/audio-sessions/7/audio' }, loading: false, paused: false, error: null, refresh() {} };
  const calls = [], playback = { phase: 'idle', play: (...args) => calls.push(args), stop: () => calls.push('stop') };
  const Screen = createLoader({
    'react-native': { View: 'view', ScrollView: 'scroll', Pressable: 'button', StyleSheet: { create: v => v } },
    'expo-router': { router: { replace() {}, navigate() {} } },
    'react-native-screens/experimental': { SafeAreaView: 'safe' },
    '@/shared/ui/AppText': { AppText: 'text' }, '@/shared/icons/CheckIcon': { CheckIcon: 'check' },
    '@/features/home/components/PronunciationSpinner': { PronunciationSpinner: 'spinner' },
    '../hooks/use-session-status': { useSessionStatus: () => state }, '../hooks/use-session-playback': { useSessionPlayback: () => playback },
  })('src/features/audio/components/AudioSessionScreen.tsx').AudioSessionScreen;
  return { state, playback, calls, render: () => Screen({ id: 7 }) };
}
test('Audio Ready plays only real returned audio and uses measured duration, then supports Stop', () => {
  const s = setup(); let tree = s.render();
  nodes(tree).find(n => n.props.accessibilityLabel === 'Play audio session').props.onPress();
  assert.deepEqual(s.calls[0], [7, '/audio-sessions/7/audio']);
  assert.ok(nodes(tree).filter(n => n.type === 'text').some(n => Array.isArray(n.props.children) && n.props.children.includes(2)));
  s.playback.phase = 'playing'; tree = s.render(); nodes(tree).find(n => n.props.accessibilityLabel === 'Stop audio session').props.onPress(); assert.equal(s.calls[1], 'stop');
});
test('real generation errors and paused status checks never advertise playback or fake completion', () => {
  const s = setup(); s.state.session.status = 'failed'; s.state.session.error = 'Provider quota exceeded';
  let tree = s.render(); assert.equal(nodes(tree).some(n => n.props.accessibilityLabel === 'Play audio session'), false);
  assert.ok(nodes(tree).some(n => n.props.accessibilityRole === 'alert' && n.props.children === 'Provider quota exceeded'));
  s.state.session.status = 'processing'; s.state.paused = true; tree = s.render();
  assert.equal(nodes(tree).some(n => n.type === 'spinner'), false);
  assert.ok(nodes(tree).some(n => n.type === 'text' && typeof n.props.children === 'string' && n.props.children.includes('Automatic checks paused')));
});
