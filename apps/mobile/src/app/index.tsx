import { Alert, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { spacing } from '@/shared/theme/spacing';
import { HomeHeader } from '@/features/home/components/HomeHeader';
import { QuickAddWord } from '@/features/home/components/QuickAddWord';
import { ContinueListeningCard } from '@/features/home/components/ContinueListeningCard';
import { mockContinueListeningSession } from '@/features/home/data/continue-listening.mock';
import { WordsReadyForAudioCard } from '@/features/home/components/WordsReadyForAudioCard';
import { RecentWordsSection } from '@/features/home/components/RecentWordsSection';
import { mockRecentWords, mockTotalWordCount } from '@/features/home/data/recent-words.mock';
import { HomeListeningStats } from '@/features/home/components/HomeListeningStats';
import { mockListeningStatistics } from '@/features/home/data/listening-statistics.mock';

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <HomeHeader />
        <QuickAddWord />
        <ContinueListeningCard
          session={mockContinueListeningSession}
          onPlay={() => Alert.alert('Playback coming soon', 'Audio playback is not available yet.')}
        />
        <WordsReadyForAudioCard
          wordCount={17}
          onCreateAudio={() => Alert.alert('Create Audio', 'Audio generation is not available yet.')}
        />
        <RecentWordsSection
          words={mockRecentWords}
          totalWordCount={mockTotalWordCount}
          onViewAll={() => Alert.alert('Recent Words', 'Viewing all words is not available yet.')}
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
