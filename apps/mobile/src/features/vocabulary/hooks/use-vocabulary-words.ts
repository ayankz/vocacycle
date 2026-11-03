import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { getWords } from '@/features/home/data/words-api';
import { RecentWordsController, type RecentWordsState } from '@/features/home/data/recent-words-controller';
import { getPendingRemoval, subscribePendingRemoval } from '@/features/home/data/pending-removal';

export function useVocabularyWords() {
  const [state, setState] = useState<RecentWordsState>({ words: [], loading: true, refreshing: false, error: null, attempts: new Map(), pronunciationAttempts: new Map() });
  const [controller] = useState(() => new RecentWordsController(getWords, setState));
  const pendingId = useSyncExternalStore(subscribePendingRemoval, getPendingRemoval, getPendingRemoval);
  useFocusEffect(useCallback(() => {
    if (AppState.currentState === 'active') controller.focus();
    const subscription = AppState.addEventListener('change', status => {
      if (status === 'active') controller.focus();
      else controller.blur();
    });
    return () => { subscription.remove(); controller.blur(); };
  }, [controller]));
  const words = useMemo(() => state.words.filter(word => word.id !== pendingId), [state.words, pendingId]);
  return { ...state, words, refresh: controller.refreshManually };
}
