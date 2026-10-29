import { Pressable, StyleSheet, View } from 'react-native';

import { PlayIcon } from '@/shared/icons/PlayIcon';
import { colors } from '@/shared/theme/colors';
import { radius } from '@/shared/theme/radius';
import { spacing } from '@/shared/theme/spacing';
import { AppText } from '@/shared/ui/AppText';
import { VocabularySessionArtwork } from './VocabularySessionArtwork';

export type ContinueListeningSession = {
  title: string;
  sessionNumber: number;
  wordRange: string;
  wordCount: number;
  durationMinutes: number;
  currentWord: string;
  translation: string;
  positionSeconds: number;
  durationSeconds: number;
};

type ContinueListeningCardProps = {
  session: ContinueListeningSession;
  onPlay: () => void;
};

function formatTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
}

export function ContinueListeningCard({ session, onPlay }: ContinueListeningCardProps) {
  const duration = Math.max(0, session.durationSeconds);
  const position = Math.max(0, Math.min(session.positionSeconds, duration));
  const progress = duration > 0 ? position / duration : 0;

  return (
    <View style={styles.section}>
      <AppText accessibilityRole="header" style={styles.heading}>Continue Listening</AppText>
      <View style={styles.card}>
        <View style={styles.sessionRow}>
          <VocabularySessionArtwork sessionNumber={session.sessionNumber} />
          <View style={styles.metadata}>
            <AppText numberOfLines={1} style={styles.title}>{session.title}</AppText>
            <AppText style={styles.wordRange} color="#D1D5DB">{session.wordRange}</AppText>
            <AppText style={styles.summary} color="#707584">
              {session.wordCount} words • {session.durationMinutes} min
            </AppText>
            <View style={styles.currentWord}>
              <AppText numberOfLines={1} style={styles.word}>{session.currentWord}</AppText>
              <AppText numberOfLines={1} style={styles.translation} color="#8C909E">
                {session.translation}
              </AppText>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Play audio"
            onPress={onPlay}
            style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}
          >
            <View style={styles.playGlyph}><PlayIcon /></View>
          </Pressable>
        </View>
        <View style={styles.progressContainer}>
          <View
            accessibilityRole="progressbar"
            accessibilityLabel="Session progress"
            accessibilityValue={{ min: 0, max: duration, now: position, text: `${formatTime(position)} of ${formatTime(duration)}` }}
            style={styles.track}
          >
            <View style={[styles.fill, { width: `${progress * 100}%` }]} />
          </View>
          <View style={styles.timestamps}>
            <AppText style={styles.time} color="#707482">{formatTime(position)}</AppText>
            <AppText style={styles.time} color="#707482">{formatTime(duration)}</AppText>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  heading: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 17, lineHeight: 25.5, letterSpacing: -0.425, paddingHorizontal: 2 },
  card: { padding: spacing[4], borderRadius: 22, borderWidth: 1, borderColor: '#23252C', backgroundColor: '#18191E', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' },
  sessionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] },
  metadata: { flex: 1, minWidth: 0, paddingRight: spacing[1] },
  title: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 16, lineHeight: 24, letterSpacing: -0.4 },
  wordRange: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 13, lineHeight: 18 },
  summary: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  currentWord: { marginTop: 10 },
  word: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 14, lineHeight: 16, letterSpacing: -0.35 },
  translation: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  playButton: { width: 48, height: 48, borderRadius: radius.full, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, boxShadow: '0 10px 15px -3px rgba(245, 158, 11, 0.2)' },
  pressed: { backgroundColor: colors.primaryPressed, transform: [{ scale: 0.95 }] },
  playGlyph: { transform: [{ translateX: 2 }] },
  progressContainer: { marginTop: spacing[4], paddingTop: spacing[1] },
  track: { height: 6, borderRadius: radius.full, backgroundColor: '#272932', overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.primary, borderRadius: radius.full },
  timestamps: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingHorizontal: 2 },
  time: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 11, lineHeight: 16.5 },
});
