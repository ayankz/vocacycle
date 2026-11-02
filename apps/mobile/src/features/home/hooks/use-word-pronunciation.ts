import { useCallback, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

import { PronunciationController, type PronunciationState } from '../data/pronunciation-controller';
import type { RecentWord } from '../components/RecentWordRow';

export function useWordPronunciation() {
  const [pronunciation, setPronunciation] = useState<PronunciationState>({ wordId: null, phase: 'idle' });
  const focused = useRef(false);
  const [controller] = useState(() => new PronunciationController(
    // Prevent the previous player's deferred iOS deactivation from silencing a
    // newly started clip. stop()/completion still remove the player and release focus.
    () => createAudioPlayer(null, { updateInterval: 100, keepAudioSessionActive: true }),
    () => setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: 'doNotMix' }),
    setPronunciation,
    () => Alert.alert('Pronunciation unavailable', 'Could not play this word. Check your connection and try again.'),
  ));

  useFocusEffect(useCallback(() => {
    focused.current = true;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') controller.stop();
    });
    return () => {
      focused.current = false;
      subscription.remove();
      controller.stop();
    };
  }, [controller]));

  const pronounce = useCallback((word: RecentWord) => {
    if (focused.current && AppState.currentState === 'active') void controller.play(word);
  }, [controller]);

  return { pronunciation, pronounce };
}
