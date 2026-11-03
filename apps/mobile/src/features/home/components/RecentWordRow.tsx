import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AudioUnavailableIcon } from '@/shared/icons/AudioUnavailableIcon';
import { PlayIcon } from '@/shared/icons/PlayIcon';
import { colors } from '@/shared/theme/colors';
import { radius } from '@/shared/theme/radius';
import { spacing } from '@/shared/theme/spacing';
import { AppText } from '@/shared/ui/AppText';
import { PronunciationSpinner } from './PronunciationSpinner';
import { PronunciationVisual } from './PronunciationVisual';

export type RecentWord = {
  id: string;
  word: string;
  phonetic: string | null;
  translation: string | null;
  translationStatus?: string;
  pronunciationAudioUrl?: string | null;
  pronunciationStatus?: 'generating' | 'ready' | 'unavailable';
};

type RecentWordRowProps = {
  word: RecentWord;
  onPronounce: (word: RecentWord) => void;
  playback?: 'idle' | 'loading' | 'playing';
  onDelete?: () => void;
};

export function RecentWordRow({ word, onPronounce, playback = 'idle', onDelete }: RecentWordRowProps) {
  const hasPronunciation = !!word.pronunciationAudioUrl?.trim();
  const generating = !hasPronunciation && word.pronunciationStatus === 'generating';
  const playing = hasPronunciation && playback === 'playing';
  const statusText = hasPronunciation ? null : generating ? 'Generating audio…' : 'Audio unavailable';
  return (
    <View style={[styles.row, playing && styles.activeRow]}>
      <View style={[styles.copy, styles.copyWithControl]}>
        <View style={styles.wordLine}>
          <AppText accessibilityActions={onDelete ? [{ name: 'delete', label: `Delete ${word.word}` }] : undefined}
            onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'delete') onDelete?.(); }}
            variant="compactTitle" style={styles.word} color={playing ? colors.primary : colors.textPrimary}>{word.word}</AppText>
          {word.phonetic && <AppText color={colors.textSubtle} style={styles.phonetic}>{word.phonetic}</AppText>}
        </View>
        <View style={styles.secondaryLine}>
          {(word.translation || word.translationStatus) && <AppText variant="caption" numberOfLines={1} color={colors.textCaption} style={styles.translation}>{word.translation || word.translationStatus}</AppText>}
          {statusText && <AppText variant="caption" color={colors.textCaption}>{statusText}</AppText>}
        </View>
      </View>
      <Pressable
        disabled={!hasPronunciation}
        accessibilityRole="button"
        accessibilityLabel={!hasPronunciation ? `${statusText} for ${word.word}` : `${playback === 'loading' ? 'Loading' : playback === 'playing' ? 'Replay' : 'Play'} pronunciation of ${word.word}`}
        accessibilityHint={hasPronunciation ? "Plays the English pronunciation" : undefined}
        accessibilityState={{ busy: generating || hasPronunciation && playback === 'loading', selected: playing, disabled: !hasPronunciation }}
        hitSlop={6}
        onPress={() => onPronounce(word)}
        style={({ pressed }) => [styles.playButton, !hasPronunciation && styles.disabled, playing && styles.playing, pressed && styles.pressed]}
      >
        <PronunciationVisual key={`${hasPronunciation}-${playback}`} playing={playing}>
          {generating ? <PronunciationSpinner /> : hasPronunciation && playback === 'loading'
            ? <ActivityIndicator size="small" color={colors.textCaption} />
            : !hasPronunciation ? <AudioUnavailableIcon color={colors.textMuted} /> : <View style={styles.playGlyph}><PlayIcon size={14} color={playback === 'playing' ? colors.primary : colors.textPrimary} /></View>}
        </PronunciationVisual>
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
  activeRow: { borderColor: 'rgba(229, 169, 60, 0.45)' },
  disabled: { backgroundColor: 'transparent' },
  copy: { flex: 1, minWidth: 0 },
  copyWithControl: { paddingRight: spacing[2] },
  wordLine: { alignItems: 'flex-start', rowGap: 2 },
  word: { flexShrink: 1 },
  phonetic: { flexShrink: 1, fontFamily: 'JetBrainsMono_400Regular', fontSize: 12, lineHeight: 16 },
  secondaryLine: { marginTop: 2, flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, alignItems: 'center' },
  translation: { flexShrink: 1 },
  playButton: { width: 32, height: 32, borderRadius: radius.full, backgroundColor: '#292B34', justifyContent: 'center', alignItems: 'center' },
  playing: { backgroundColor: colors.primarySubtle },
  pressed: { backgroundColor: '#343642', transform: [{ scale: 0.95 }] },
  playGlyph: { transform: [{ translateX: 2 }] },
});
