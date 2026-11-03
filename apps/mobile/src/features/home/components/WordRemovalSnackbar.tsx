import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/shared/ui/AppText';
import { colors } from '@/shared/theme/colors';

export function WordRemovalSnackbar({ undoAvailable, busy, onUndo }: { undoAvailable: boolean; busy: boolean; onUndo: () => void }) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.snackbar, { marginBottom: insets.bottom + 8 }]} accessibilityLiveRegion="polite">
    <AppText variant="caption">Word removed</AppText>
    {undoAvailable && <Pressable accessibilityRole="button" accessibilityLabel="Undo word removal" disabled={busy}
      onPress={onUndo} hitSlop={10}>
      <AppText variant="caption" color={colors.primary}>Undo</AppText>
    </Pressable>}
  </View>;
}
const styles = StyleSheet.create({
  snackbar: { marginHorizontal: 20, marginBottom: 8, paddingHorizontal: 16, paddingVertical: 14,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#222328', borderColor: '#34343B', borderWidth: 1, borderRadius: 14 },
});
