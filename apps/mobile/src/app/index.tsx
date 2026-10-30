import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { spacing } from '@/shared/theme/spacing';
import { HomeHeader } from '@/features/home/components/HomeHeader';
import { QuickAddWord } from '@/features/home/components/QuickAddWord';
import { ContinueListeningCard } from '@/features/home/components/ContinueListeningCard';
import { mockContinueListeningSession } from '@/features/home/data/continue-listening.mock';
import { WordsReadyForAudioCard } from '@/features/home/components/WordsReadyForAudioCard';
import { RecentWordsSection } from '@/features/home/components/RecentWordsSection';
import type { RecentWord } from '@/features/home/components/RecentWordRow';
import { getWords } from '@/features/home/data/words-api';
import { HomeListeningStats } from '@/features/home/components/HomeListeningStats';
import { mockListeningStatistics } from '@/features/home/data/listening-statistics.mock';

export default function HomeScreen() {
  const [recentWords, setRecentWords] = useState<RecentWord[]>([]);
  const [totalWordCount, setTotalWordCount] = useState(0);
  const [wordsLoading, setWordsLoading] = useState(true);
  const [wordsError, setWordsError] = useState<string | null>(null);

  const refreshWords = useCallback(async () => {
    setWordsLoading(true);
    try {
      const words = await getWords();
      const newestFirst = [...words].sort((a, b) => b.id - a.id);
      setTotalWordCount(words.length);
      setRecentWords(newestFirst.map(({ id, text, translation }) => ({
        id: String(id),
        word: text,
        translation,
        phonetic: null,
      })));
      setWordsError(null);
    } catch (error) {
      setWordsError(error instanceof Error ? error.message : 'Could not load saved words.');
    } finally {
      setWordsLoading(false);
    }
  }, []);

  useEffect(() => { void refreshWords(); }, [refreshWords]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <HomeHeader />
        <QuickAddWord onAdded={() => void refreshWords()} />
        <ContinueListeningCard
          session={mockContinueListeningSession}
          onPlay={() => Alert.alert('Playback coming soon', 'Audio playback is not available yet.')}
        />
        <WordsReadyForAudioCard
          wordCount={17}
          onCreateAudio={() => Alert.alert('Create Audio', 'Audio generation is not available yet.')}
        />
        <RecentWordsSection
          words={recentWords}
          totalWordCount={totalWordCount}
          loading={wordsLoading}
          error={wordsError}
          onPronounce={(word) => Alert.alert(word.word, 'Pronunciation playback is not available yet.')}
        />
        <HomeListeningStats statistics={mockListeningStatistics} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111215',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[3],
    paddingBottom: spacing[6],
    gap: spacing[5],
  },
});
