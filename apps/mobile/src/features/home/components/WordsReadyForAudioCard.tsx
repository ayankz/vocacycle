import { useId } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { ArrowRightIcon } from '@/shared/icons/ArrowRightIcon';
import { colors } from '@/shared/theme/colors';
import { radius } from '@/shared/theme/radius';
import { spacing } from '@/shared/theme/spacing';
import { AppText } from '@/shared/ui/AppText';

type WordsReadyForAudioCardProps = {
  wordCount: number;
  onCreateAudio: () => void;
};

export function WordsReadyForAudioCard({ wordCount, onCreateAudio }: WordsReadyForAudioCardProps) {
  const gradientId = useId();

  return (
    <View style={styles.card}>
      <Svg pointerEvents="none" width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={gradientId} x1="0%" y1="100%" x2="100%" y2="0%">
            <Stop offset="0" stopColor="#1B1915" />
            <Stop offset="1" stopColor="#1E1C16" />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${gradientId})`} />
      </Svg>
      <View style={styles.copy}>
        <View style={styles.headingRow}>
          <View style={styles.dot} />
          <AppText accessibilityRole="header" variant="compactTitle" style={styles.heading}>
            {wordCount} {wordCount === 1 ? 'word' : 'words'} ready for audio
          </AppText>
        </View>
        <AppText color={colors.textCaption} style={styles.description}>
          Turn your saved words into a listening session.
        </AppText>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Create Audio"
        onPress={onCreateAudio}
        hitSlop={6}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <AppText color="#000000" style={styles.buttonLabel}>Create Audio</AppText>
        <ArrowRightIcon />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
    padding: spacing[4],
    backgroundColor: '#1B1915',
    borderWidth: 1,
    borderColor: 'rgba(229, 169, 60, 0.3)',
    borderRadius: radius.card,
    overflow: 'hidden',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
  },
  copy: { flex: 1, minWidth: 0 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  dot: { width: 8, height: 8, borderRadius: radius.full, backgroundColor: colors.primary },
  heading: {
    flex: 1,
  },
  description: { marginTop: spacing[1], fontSize: 12, lineHeight: 16.5 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: spacing[2],
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  },
  buttonLabel: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 12, lineHeight: 16 },
  pressed: { backgroundColor: colors.primaryPressed, transform: [{ scale: 0.95 }] },
});
