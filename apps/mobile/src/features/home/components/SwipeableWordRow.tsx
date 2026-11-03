import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { cancelAnimation, ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { TrashIcon } from '@/shared/icons/TrashIcon';
import { AppText } from '@/shared/ui/AppText';
import { RecentWordRow, type RecentWord } from './RecentWordRow';
import type { SwipeRowCoordinator } from '../data/swipe-row-coordinator';

export function SwipeableWordRow({ word, playback, onPronounce, onDelete, deleting, deleteDisabled, swipes }: {
  word: RecentWord; playback: 'idle' | 'loading' | 'playing'; onPronounce: (word: RecentWord) => void;
  onDelete: (id: string) => void; deleting: boolean; deleteDisabled: boolean; swipes: SwipeRowCoordinator;
}) {
  const swipe = useRef<SwipeableMethods>(null);
  const opacity = useSharedValue(deleting ? 0 : 1);
  const scale = useSharedValue(deleting ? 0.96 : 1);
  const fraction = useSharedValue(deleting ? 0 : 1);
  const measured = useSharedValue(0);
  useEffect(() => {
    if (deleting) swipe.current?.close();
    const config = { duration: 200, reduceMotion: ReduceMotion.System };
    opacity.value = deleting ? withTiming(0, config) : withDelay(50, withTiming(1, config), ReduceMotion.System);
    scale.value = withTiming(deleting ? 0.96 : 1, config);
    const collapse = withTiming(deleting ? 0 : 1, { duration: 250, reduceMotion: ReduceMotion.System });
    fraction.value = withDelay(100, collapse, ReduceMotion.System);
    return () => { cancelAnimation(opacity); cancelAnimation(scale); cancelAnimation(fraction); };
  }, [deleting, fraction, opacity, scale]);
  useEffect(() => () => swipes.dispose(word.id), [swipes, word.id]);
  const rowStyle = useAnimatedStyle(() => ({
    // Ordinary rows must lay out naturally before onLayout can measure them.
    // Only collapse/Undo needs a fixed height; an unavailable measurement must
    // never leave a normal/restored row stuck at zero height.
    height: fraction.value === 1 || (measured.value === 0 && !deleting)
      ? undefined : measured.value * fraction.value,
    marginBottom: 8 * fraction.value,
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));
  const reveal = () => { if (swipe.current) swipes.open(word.id, swipe.current.close); };
  return <Animated.View style={[styles.container, rowStyle]} pointerEvents={deleting ? 'none' : 'auto'}
    accessibilityElementsHidden={deleting} importantForAccessibility={deleting ? 'no-hide-descendants' : 'auto'}>
    <View onLayout={event => {
      const height = event.nativeEvent.layout.height;
      if (Number.isFinite(height) && height > 0) measured.value = height;
    }}>
      <Swipeable ref={swipe} enabled={!deleteDisabled && !deleting} overshootRight={false} overshootLeft={false}
        onSwipeableOpenStartDrag={reveal} onSwipeableWillOpen={reveal}
        renderRightActions={() => <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${word.word}`}
          disabled={deleteDisabled} accessibilityState={{ disabled: deleteDisabled }}
          onPress={() => onDelete(word.id)} style={styles.delete}>
          <TrashIcon /><AppText variant="caption" color="#D9A2A2">Delete</AppText>
        </Pressable>}>
        <RecentWordRow word={word} onPronounce={onPronounce} onDelete={!deleteDisabled ? () => onDelete(word.id) : undefined} playback={deleting ? 'idle' : playback} />
      </Swipeable>
    </View>
  </Animated.View>;
}
const styles = StyleSheet.create({
  container: { overflow: 'hidden', borderRadius: 16 },
  delete: { width: 76, backgroundColor: '#392326', alignItems: 'center', justifyContent: 'center', gap: 6, marginLeft: 8, borderRadius: 16 },
});
