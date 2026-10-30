import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { radius } from '@/shared/theme/radius';
import { spacing } from '@/shared/theme/spacing';
import { AppText } from '@/shared/ui/AppText';

export function VocabularySessionArtwork({ sessionNumber }: { sessionNumber: number }) {
  const id = useId();
  const backgroundId = `${id}-background`;
  const glowId = `${id}-glow`;

  return (
    <View style={styles.cover} accessible={false}>
      <Svg width="100%" height="100%" viewBox="0 0 80 96" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={backgroundId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#0F1827" />
            <Stop offset="1" stopColor="#050912" />
          </LinearGradient>
          <RadialGradient id={glowId} cx="0.3" cy="0.25" r="0.5">
            <Stop offset="0" stopColor="#164E63" stopOpacity={0.4} />
            <Stop offset="1" stopColor="#164E63" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={80} height={96} fill={`url(#${backgroundId})`} />
        <Rect width={80} height={96} fill={`url(#${glowId})`} />
        <Path d="M28 35v24h24V35" fill="none" stroke="#FCD34D" strokeOpacity={0.4} />
        <Rect x={37} y={43} width={6} height={8} fill="#FBBF24" fillOpacity={0.8} />
      </Svg>
      <AppText style={styles.label}>{`VOCAB\n#${sessionNumber}`}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    width: 80,
    height: 96,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'flex-end',
    padding: spacing[2],
  },
  label: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 9,
    lineHeight: 10,
    letterSpacing: -0.225,
    color: 'rgba(255, 255, 255, 0.95)',
  },
});
