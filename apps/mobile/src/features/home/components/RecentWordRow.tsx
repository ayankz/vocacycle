import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

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
  translationStatus?: string;
  pronunciationAudioUrl?: string | null;
};

type RecentWordRowProps = {
  word: RecentWord;
  onPronounce: (word: RecentWord) => void;
  playback?: 'idle' | 'loading' | 'playing';
};

export function RecentWordRow({ word, onPronounce, playback = 'idle' }: RecentWordRowProps) {
  const hasPronunciation = !!word.pronunciationAudioUrl?.trim();
  return (
    <View style={styles.row}>
      <View style={[styles.copy, hasPronunciation && styles.copyWithControl]}>
        <View style={styles.wordLine}>
          <AppText variant="compactTitle" style={styles.word}>{word.word}</AppText>
          {word.phonetic && <AppText color={colors.textSubtle} style={styles.phonetic}>{word.phonetic}</AppText>}
        </View>
        {(word.translation || word.translationStatus) && <AppText variant="caption" numberOfLines={1} color={colors.textCaption} style={styles.translation}>{word.translation || word.translationStatus}</AppText>}
      </View>
      {hasPronunciation && <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${playback === 'loading' ? 'Loading' : playback === 'playing' ? 'Replay' : 'Play'} pronunciation of ${word.word}`}
        accessibilityHint="Plays the English pronunciation"
        accessibilityState={{ busy: playback === 'loading', selected: playback === 'playing' }}
        hitSlop={6}
        onPress={() => onPronounce(word)}
        style={({ pressed }) => [styles.playButton, playback === 'playing' && styles.playing, pressed && styles.pressed]}
      >
        {playback === 'loading'
          ? <ActivityIndicator size="small" color={colors.textPrimary} />
          : <View style={styles.playGlyph}><PlayIcon size={14} color={playback === 'playing' ? colors.primary : colors.textPrimary} /></View>}
      </Pressable>}
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
  copy: { flex: 1, minWidth: 0 },
  copyWithControl: { paddingRight: spacing[2] },
  wordLine: { alignItems: 'flex-start', rowGap: 2 },
  word: { flexShrink: 1 },
  phonetic: { flexShrink: 1, fontFamily: 'JetBrainsMono_400Regular', fontSize: 12, lineHeight: 16 },
  translation: { marginTop: 2 },
  playButton: { width: 32, height: 32, borderRadius: radius.full, backgroundColor: '#292B34', justifyContent: 'center', alignItems: 'center' },
  playing: { backgroundColor: colors.primarySubtle },
  pressed: { backgroundColor: '#343642', transform: [{ scale: 0.95 }] },
  playGlyph: { transform: [{ translateX: 2 }] },
});
