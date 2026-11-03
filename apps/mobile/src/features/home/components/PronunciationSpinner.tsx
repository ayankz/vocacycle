import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { colors } from '@/shared/theme/colors';

/** Decorative, indeterminate generation indicator; the parent exposes busy status. */
export function PronunciationSpinner() {
  const [rotation] = useState(() => new Animated.Value(0));
  useEffect(() => {
    let disposed = false;
    let animation: Animated.CompositeAnimation | undefined;
    const update = (reduceMotion: boolean) => {
      if (disposed) return;
      animation?.stop();
      rotation.setValue(0);
      if (reduceMotion) return;
      animation = Animated.loop(Animated.timing(rotation, {
        toValue: 1, duration: 1000, easing: Easing.linear,
        useNativeDriver: true, isInteraction: false,
      }));
      animation.start();
    };
    void AccessibilityInfo.isReduceMotionEnabled().then(update).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', update);
    return () => { disposed = true; subscription.remove(); animation?.stop(); };
  }, [rotation]);

  return <Animated.View
    accessible={false}
    testID="pronunciation-generation-spinner"
    style={[styles.circle, { transform: [{ rotate: rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}
  >
    <Svg width={32} height={32} viewBox="0 0 32 32" fill="none">
      <Circle cx={16} cy={16} r={10} stroke="#34353C" strokeWidth={2.5} />
      <Path d="M16 6 A10 10 0 0 1 26 16" stroke={colors.primary} strokeWidth={2.5} strokeLinecap="round" />
    </Svg>
  </Animated.View>;
}

const styles = StyleSheet.create({
  circle: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#1B1B1F', alignItems: 'center', justifyContent: 'center' },
});
