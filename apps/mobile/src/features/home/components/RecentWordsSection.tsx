import { Pressable, StyleSheet, View } from 'react-native';

import { ChevronRightIcon } from '@/shared/icons/ChevronRightIcon';
import { spacing } from '@/shared/theme/spacing';
import { AppText } from '@/shared/ui/AppText';
import { RecentWordRow, type RecentWord } from './RecentWordRow';

type RecentWordsSectionProps = {
  words: readonly RecentWord[];
  totalWordCount: number;
  onViewAll: () => void;
  onPronounce: (word: RecentWord) => void;
};

export function RecentWordsSection({ words, totalWordCount, onViewAll, onPronounce }: RecentWordsSectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <AppText accessibilityRole="header" style={styles.heading}>Recent Words</AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View all (${totalWordCount})`}
          onPress={onViewAll}
          hitSlop={8}
          style={({ pressed }) => [styles.viewAll, pressed && styles.pressed]}
        >
          <AppText color="#8B8E9B" style={styles.actionText}>View all ({totalWordCount})</AppText>
          <ChevronRightIcon />
        </Pressable>
      </View>
      <View style={styles.words}>
        {words.map((word) => <RecentWordRow key={word.id} word={word} onPronounce={onPronounce} />)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing[2], paddingHorizontal: 2 },
  heading: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 17, lineHeight: 25.5, letterSpacing: -0.425 },
  viewAll: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  actionText: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 12, lineHeight: 16 },
  pressed: { opacity: 0.65 },
  words: { gap: spacing[2] },
});
