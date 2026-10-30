import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { getWords } from '../data/words-api';
import { RecentWordsController, type RecentWordsState } from '../data/recent-words-controller';

export function useRecentWords() {
  const [state, setState] = useState<RecentWordsState>({ words: [], loading: true, error: null, attempts: new Map() });
  const [controller] = useState(() => new RecentWordsController(getWords, setState));
  useFocusEffect(useCallback(() => {
    controller.focus();
    return controller.blur;
  }, [controller]));

  return {
    recentWords: state.words.map(({ id, text, translation }) => ({
      id: String(id), word: text, translation, phonetic: null,
      translationStatus: state.attempts.has(id)
        ? state.attempts.get(id)! < 5 ? 'Translating...' : 'Translation unavailable'
        : undefined,
    })),
    totalWordCount: state.words.length,
    wordsLoading: state.loading,
    wordsError: state.error,
    onAdded: controller.added,
  };
}
