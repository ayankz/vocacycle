import { useCallback, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { pronunciationAvailability } from '../data/pronunciation-status';
import { setPendingRemoval } from '../data/pending-removal';
import { deletionStore } from '../data/deletion-store';
import { WordDeletionController, type WordDeletionState } from '../data/word-deletion-controller';
import { deleteWord, getWords } from '../data/words-api';
import { RecentWordsController, type RecentWordsState } from '../data/recent-words-controller';

export function useRecentWords() {
  const [state, setState] = useState<RecentWordsState>({ words: [], loading: true, refreshing: false, error: null, attempts: new Map(), pronunciationAttempts: new Map() });
  const [controller] = useState(() => new RecentWordsController(getWords, setState));
  const [deletion, setDeletion] = useState<WordDeletionState>({ pending: null, ready: false, busy: false, undoAvailable: false, error: null });
  const [deletions] = useState(() => new WordDeletionController(deletionStore, deleteWord, value => {
    setDeletion(value);
    setPendingRemoval(value.pending?.word.id ?? null);
  }, controller.removed, controller.restored));
  useFocusEffect(useCallback(() => {
    if (AppState.currentState === 'active') { controller.focus(); deletions.start(); }
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') { controller.focus(); deletions.start(); }
      else { controller.blur(); deletions.stop(); }
    });
    return () => { subscription.remove(); controller.blur(); deletions.stop(); };
  }, [controller, deletions]));

  const words = deletion.pending && !state.words.some(word => word.id === deletion.pending!.word.id)
    ? [deletion.pending.word, ...state.words].sort((a, b) => b.id - a.id) : state.words;
  return {
    deletion,
    onDelete: (id: string) => {
      const word = words.find(word => String(word.id) === id);
      return word ? deletions.delete(word) : Promise.resolve(false);
    },
    onUndo: deletions.undo,
    recentWords: words.map(({ id, text, translation, ipa, pronunciationAudioUrl }) => ({
      id: String(id), word: text, translation, phonetic: ipa, pronunciationAudioUrl,
      pronunciationStatus: pronunciationAvailability(pronunciationAudioUrl, state.pronunciationAttempts.get(id)),
      translationStatus: !translation && state.attempts.has(id)
        ? state.attempts.get(id)! < 5 ? 'Translating...' : 'Translation unavailable'
        : undefined,
    })),
    totalWordCount: words.length - (deletion.pending ? 1 : 0),
    wordsLoading: state.loading,
    wordsRefreshing: state.refreshing,
    onRefresh: () => { controller.refreshManually(); void deletions.retry(); },
    wordsError: deletion.error ?? state.error,
    onAdded: controller.added,
  };
}
