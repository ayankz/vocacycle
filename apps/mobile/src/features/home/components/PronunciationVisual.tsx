import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, View } from 'react-native';

import { colors } from '@/shared/theme/colors';

// Native opacity/transform animation only; loops are removed with the active glyph.
export function PronunciationVisual({ children, playing = false }: { children?: React.ReactNode; playing?: boolean }) {
  const [opacity] = useState(() => new Animated.Value(1));
  const [pulse] = useState(() => new Animated.Value(0.5));
  useEffect(() => {
    let disposed = false;
    let animation: Animated.CompositeAnimation | undefined;
    const update = (reduceMotion: boolean) => {
      if (disposed) return;
      animation?.stop();
      opacity.setValue(1);
      pulse.setValue(0.5);
      if (reduceMotion) return;
      opacity.setValue(0.45);
      const fade = Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true, isInteraction: false });
      animation = playing ? Animated.parallel([fade, Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 420, useNativeDriver: true, isInteraction: false }),
        Animated.timing(pulse, { toValue: 0.35, duration: 420, useNativeDriver: true, isInteraction: false }),
      ]))]) : fade;
      animation.start();
    };
    void AccessibilityInfo.isReduceMotionEnabled().then(update).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', update);
    return () => { disposed = true; subscription.remove(); animation?.stop(); };
  }, [opacity, playing, pulse]);
  return <Animated.View accessible={false} style={{ opacity }}>
    {playing ? <View style={styles.bars}>
      {[8, 14, 10].map((height, index) => <Animated.View key={height} style={[styles.bar, { height, transform: [{ scaleY: index === 1 ? pulse : pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.45] }) }] }]} />)}
    </View> : children}
  </Animated.View>;
}

const styles = StyleSheet.create({
  bars: { height: 16, flexDirection: 'row', alignItems: 'center', gap: 3 },
  bar: { width: 2, borderRadius: 1, backgroundColor: colors.primary },
});
