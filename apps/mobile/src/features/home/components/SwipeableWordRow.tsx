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
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.96);
  const fraction = useSharedValue(0);
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
    height: measured.value * fraction.value,
    marginBottom: 8 * fraction.value,
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));
  const reveal = () => { if (swipe.current) swipes.open(word.id, swipe.current.close); };
  return <Animated.View style={[styles.container, rowStyle]} pointerEvents={deleting ? 'none' : 'auto'}
    accessibilityElementsHidden={deleting} importantForAccessibility={deleting ? 'no-hide-descendants' : 'auto'}>
    <View onLayout={event => { measured.value = event.nativeEvent.layout.height; }}>
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
