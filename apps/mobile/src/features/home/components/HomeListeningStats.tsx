import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import { radius } from '@/shared/theme/radius';
import { spacing } from '@/shared/theme/spacing';
import { AppText } from '@/shared/ui/AppText';

export type HomeListeningStatistics = {
  wordsSaved: number;
  sessions: number;
  listenedMinutes: number;
};

export function HomeListeningStats({ statistics }: { statistics: HomeListeningStatistics }) {
  const hours = Math.floor(statistics.listenedMinutes / 60);
  const minutes = statistics.listenedMinutes % 60;
  const metrics = [
    { value: String(statistics.wordsSaved), label: 'words saved' },
    { value: String(statistics.sessions), label: 'sessions' },
    { value: hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`, label: 'listened' },
  ];

  return (
    <View style={styles.section}>
      <View style={styles.strip}>
        {metrics.map((metric, index) => (
          <Fragment key={metric.label}>
            {index > 0 && <AppText accessible={false} color="#2D2F38" style={styles.separator}>•</AppText>}
            <View style={styles.metric} accessible accessibilityLabel={`${metric.value} ${metric.label}`}>
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
    borderColor: '#23252C',
    backgroundColor: '#16171C',
  },
  metric: { flexShrink: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'baseline', columnGap: 6 },
  value: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 13, lineHeight: 20, letterSpacing: -0.325, textAlign: 'center' },
  label: { fontSize: 12, lineHeight: 20, textAlign: 'center' },
  separator: { fontSize: 14, lineHeight: 20 },
});
