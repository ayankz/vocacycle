import { Alert, RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '@/shared/theme/colors';
import { spacing } from '@/shared/theme/spacing';
import { WordRemovalSnackbar } from '@/features/home/components/WordRemovalSnackbar';
import { HomeHeader } from '@/features/home/components/HomeHeader';
import { QuickAddWord } from '@/features/home/components/QuickAddWord';
import { ContinueListeningCard } from '@/features/home/components/ContinueListeningCard';
import { mockContinueListeningSession } from '@/features/home/data/continue-listening.mock';
import { WordsReadyForAudioCard } from '@/features/home/components/WordsReadyForAudioCard';
import { RecentWordsSection } from '@/features/home/components/RecentWordsSection';
import { useRecentWords } from '@/features/home/hooks/use-recent-words';
import { useWordPronunciation } from '@/features/home/hooks/use-word-pronunciation';
import { HomeListeningStats } from '@/features/home/components/HomeListeningStats';
import { mockListeningStatistics } from '@/features/home/data/listening-statistics.mock';

export default function HomeScreen() {
  const { recentWords, totalWordCount, wordsLoading, wordsRefreshing, wordsError, onRefresh, onAdded, deletion, onDelete, onUndo } = useRecentWords();
  const { pronunciation, pronounce, stopWord } = useWordPronunciation();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        alwaysBounceVertical
        refreshControl={<RefreshControl
          refreshing={wordsRefreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
          progressBackgroundColor={colors.surface}
        />}
      >
        <HomeHeader />
        <QuickAddWord onAdded={onAdded} />
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
          onPronounce={pronounce}
          pronunciation={pronunciation}
          deletingId={deletion?.pending ? String(deletion.pending.word.id) : undefined}
          deleteDisabled={!deletion?.ready || deletion.busy || !!deletion.pending}
          onDelete={id => { void onDelete(id).then(accepted => { if (accepted) stopWord(id); }); }}
        />
        <HomeListeningStats statistics={mockListeningStatistics} />
      </ScrollView>
      {deletion?.pending && <WordRemovalSnackbar undoAvailable={deletion.undoAvailable} busy={deletion.busy} onUndo={() => void onUndo()} />}
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
