import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import { radius } from '@/shared/theme/radius';
import { spacing } from '@/shared/theme/spacing';
import { colors } from '@/shared/theme/colors';
import { AppText } from '@/shared/ui/AppText';

export type HomeListeningStatistics = {
  wordsSaved: number | null;
  sessions: number | null;
  listenedMinutes: number | null;
};

export function HomeListeningStats({ statistics, loading = false, error }: { statistics: HomeListeningStatistics; loading?: boolean; error?: string | null }) {
  const duration = statistics.listenedMinutes;
  const hours = duration === null ? 0 : Math.floor(duration / 60);
  const minutes = duration === null ? 0 : duration % 60;
  const stale = !loading && !!error && statistics.wordsSaved !== null;
  const metrics = [
    { value: loading ? '…' : statistics.wordsSaved === null ? '—' : String(statistics.wordsSaved), label: stale ? 'words saved (stale)' : 'words saved', hint: error ? 'Could not refresh saved words. Pull to refresh to try again.' : undefined },
    { value: statistics.sessions === null ? '—' : String(statistics.sessions), label: 'sessions' },
    { value: duration === null ? '—' : hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`, label: 'listened' },
  ];

  return (
    <View style={styles.section}>
      <View style={styles.strip}>
        {metrics.map((metric, index) => (
          <Fragment key={metric.label}>
            {index > 0 && <AppText accessible={false} color="#2D2F38" style={styles.separator}>•</AppText>}
            <View style={styles.metric} accessible accessibilityLabel={`${metric.value === '—' ? 'Unavailable' : metric.value === '…' ? 'Loading' : metric.value} ${metric.label}`} accessibilityHint={metric.hint}>
              <AppText style={styles.value}>{metric.value}</AppText>
              <AppText color="#787C8A" style={styles.label}>{metric.label}</AppText>
            </View>
          </Fragment>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingTop: spacing[1] },
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    gap: spacing[1],
    paddingHorizontal: spacing[4],
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: '#16171C',
  },
  metric: { flexShrink: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'baseline', columnGap: 6 },
  value: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 13, lineHeight: 20, letterSpacing: -0.325, textAlign: 'center' },
  label: { fontSize: 12, lineHeight: 20, textAlign: 'center' },
  separator: { fontSize: 14, lineHeight: 20 },
});
