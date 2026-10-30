import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ChevronRightIcon } from '@/shared/icons/ChevronRightIcon';
import { spacing } from '@/shared/theme/spacing';
import { AppText } from '@/shared/ui/AppText';
import { RecentWordRow, type RecentWord } from './RecentWordRow';

type RecentWordsSectionProps = {
  words: readonly RecentWord[];
  totalWordCount: number;
  loading?: boolean;
  error?: string | null;
  onPronounce: (word: RecentWord) => void;
};

const COLLAPSED_WORD_COUNT = 4;

export function RecentWordsSection({ words, totalWordCount, loading = false, error, onPronounce }: RecentWordsSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const canExpand = totalWordCount > COLLAPSED_WORD_COUNT;
  const visibleWords = expanded ? words : words.slice(0, COLLAPSED_WORD_COUNT);
  const actionLabel = expanded ? 'Show less' : `View all (${totalWordCount})`;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <AppText accessibilityRole="header" variant="sectionHeading">Recent Words</AppText>
        {canExpand && <Pressable
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            onPress={() => setExpanded((isExpanded) => !isExpanded)}
            hitSlop={8}
            style={({ pressed }) => [styles.viewAll, pressed && styles.pressed]}
          >
            <AppText color="#8B8E9B" style={styles.actionText}>{actionLabel}</AppText>
            {!expanded && <ChevronRightIcon />}
          </Pressable>}
      </View>
      <View style={styles.words}>
        {visibleWords.map((word) => <RecentWordRow key={word.id} word={word} onPronounce={onPronounce} />)}
        {loading && <AppText variant="caption" color="#8C909E">Loading saved words…</AppText>}
        {!loading && error && <AppText variant="caption" color="#F87171">{error}</AppText>}
        {!loading && !error && words.length === 0 && <AppText variant="caption" color="#8C909E">No saved words yet.</AppText>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing[2], paddingHorizontal: 2 },
  viewAll: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  actionText: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 12, lineHeight: 16 },
  pressed: { opacity: 0.65 },
  words: { gap: spacing[2] },
});
