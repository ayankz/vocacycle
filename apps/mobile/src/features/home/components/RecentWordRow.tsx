import { Pressable, StyleSheet, View } from 'react-native';

import { PlayIcon } from '@/shared/icons/PlayIcon';
import { colors } from '@/shared/theme/colors';
import { radius } from '@/shared/theme/radius';
import { spacing } from '@/shared/theme/spacing';
import { AppText } from '@/shared/ui/AppText';

export type RecentWord = {
  id: string;
  word: string;
  phonetic: string | null;
  translation: string | null;
};

type RecentWordRowProps = {
  word: RecentWord;
  onPronounce: (word: RecentWord) => void;
};

export function RecentWordRow({ word, onPronounce }: RecentWordRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        <View style={styles.wordLine}>
          <AppText variant="compactTitle" style={styles.word}>{word.word}</AppText>
          {word.phonetic && <AppText color={colors.textSubtle} style={styles.phonetic}>{word.phonetic}</AppText>}
        </View>
        {word.translation && <AppText variant="caption" numberOfLines={1} color={colors.textCaption} style={styles.translation}>{word.translation}</AppText>}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Play pronunciation of ${word.word}`}
        accessibilityHint="Pronunciation playback is not available yet"
        hitSlop={6}
        onPress={() => onPronounce(word)}
        style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}
      >
        <View style={styles.playGlyph}><PlayIcon size={14} color={colors.textPrimary} /></View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    backgroundColor: '#17181D',
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  copy: { flex: 1, minWidth: 0, paddingRight: spacing[2] },
  wordLine: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: spacing[2] },
  word: { flexShrink: 1 },
  phonetic: { flexShrink: 1, fontFamily: 'JetBrainsMono_400Regular', fontSize: 12, lineHeight: 16 },
  translation: { marginTop: 2 },
  playButton: { width: 32, height: 32, borderRadius: radius.full, backgroundColor: '#292B34', justifyContent: 'center', alignItems: 'center' },
  pressed: { backgroundColor: '#343642', transform: [{ scale: 0.95 }] },
  playGlyph: { transform: [{ translateX: 2 }] },
});
