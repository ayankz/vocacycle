import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { SafeAreaView } from 'react-native-screens/experimental';

import { AppText } from '@/shared/ui/AppText';
import { CheckIcon } from '@/shared/icons/CheckIcon';
import { ArrowRightIcon } from '@/shared/icons/ArrowRightIcon';
import { colors } from '@/shared/theme/colors';
import { radius } from '@/shared/theme/radius';
import { spacing } from '@/shared/theme/spacing';
import { useVocabularyWords } from '../hooks/use-vocabulary-words';
import { selectAll, toggleSelection, validSelection } from '../data/selection';

export function VocabularyScreen({ onContinue }: { onContinue: (wordIds: number[]) => void }) {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const selecting = mode === 'select';
  const navigation = useNavigation();
  const { words, loading, refreshing, error, refresh } = useVocabularyWords();
  const [selection, setSelection] = useState(() => ({ words, selecting, ids: new Set<number>() }));
  // Reconcile while rendering so a removed ID cannot be submitted or resurrected.
  const selected = selection.words === words && selection.selecting === selecting
    ? selection.ids : new Set(selecting ? validSelection(selection.ids, words) : []);
  if (selection.words !== words || selection.selecting !== selecting) {
    setSelection({ words, selecting, ids: selected });
  }
  const setSelected = (value: Set<number> | ((previous: Set<number>) => Set<number>)) => {
    setSelection(previous => ({ ...previous, ids: typeof value === 'function' ? value(previous.ids) : value }));
  };
  const ids = validSelection(selected, words);
  const allSelected = words.length > 0 && ids.length === words.length;
  const canContinue = !loading && !refreshing && !error && ids.length > 0;

  // Target this route, even when another tab is already focused during cleanup.
  useFocusEffect(useCallback(() => () => {
    setSelection(previous => ({ ...previous, ids: new Set() }));
    navigation.setParams({ mode: undefined } as never);
  }, [navigation]));

  const cancel = () => {
    setSelected(new Set());
    router.setParams({ mode: undefined });
  };
  const continueSelection = () => {
    if (!canContinue) return;
    onContinue(ids);
  };

  return (
    // Native screen insets include the tab bar and home indicator once.
    <SafeAreaView style={styles.screen} edges={{ top: true, bottom: true, left: true, right: true }}>
      {selecting ? <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={cancel} style={styles.headerButton}><AppText color={colors.textSecondary}>Cancel</AppText></Pressable>
        <View style={styles.count} accessibilityLiveRegion="polite">
          <AppText variant="compactTitle" color={colors.primary}>{ids.length} selected</AppText>
          <AppText variant="caption" color={colors.textSubtle}>{loading ? 'Loading…' : error ? 'Refresh needed' : `of ${words.length} words`}</AppText>
        </View>
        <Pressable accessibilityRole="button" disabled={loading || !!error || !words.length} accessibilityState={{ disabled: loading || !!error || !words.length }}
          onPress={() => setSelected(previous => selectAll(previous, words))} style={styles.headerButton}>
          <AppText variant="bodySmall" color={colors.primary}>{allSelected ? 'Deselect All' : 'Select All'}</AppText>
        </Pressable>
      </View> : <View style={styles.header}>
        <AppText variant="pageTitle">Vocabulary</AppText>
        <Pressable accessibilityRole="button" disabled={loading || !!error || !words.length} onPress={() => { setSelected(new Set()); router.setParams({ mode: 'select' }); }} style={styles.headerButton}>
          <AppText color={colors.primary}>Select</AppText>
        </Pressable>
      </View>}
      {!!error && <View style={styles.message} accessibilityRole="alert">
        <AppText variant="bodySmall" color={colors.textSecondary}>Could not refresh vocabulary. Please try again.</AppText>
        <Pressable accessibilityRole="button" onPress={refresh} style={styles.headerButton}><AppText color={colors.primary}>Try again</AppText></Pressable>
      </View>}
      <FlatList
        style={styles.scroll}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        data={words}
        keyExtractor={word => String(word.id)}
        extraData={selected}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} progressBackgroundColor={colors.surface} />}
        ListEmptyComponent={<View style={styles.message}><AppText color={colors.textSecondary}>{loading ? 'Loading vocabulary…' : error ? 'Vocabulary could not be loaded.' : 'No saved words yet. Add a word on Home to get started.'}</AppText></View>}
        renderItem={({ item }) => {
          const checked = selected.has(item.id);
          const copy = <View style={styles.copy}>
            <AppText variant="compactTitle" color={selecting && !checked ? colors.textSecondary : colors.textPrimary}>{item.text}</AppText>
            {!!item.ipa && <AppText style={styles.ipa} color={colors.textSubtle}>{item.ipa}</AppText>}
            {!!item.translation && <AppText variant="bodySmall" color={colors.textSecondary}>{item.translation}</AppText>}
          </View>;
          return selecting ? <Pressable accessibilityRole="checkbox" accessibilityLabel={[item.text, item.translation, item.ipa].filter(Boolean).join(', ')} accessibilityState={{ checked }}
            onPress={() => setSelected(previous => toggleSelection(previous, item.id))} style={[styles.row, checked && styles.selectedRow]}>
            <View style={[styles.checkbox, checked && styles.checked]}>{checked && <CheckIcon color={colors.textOnPrimary} />}</View>
            {copy}
          </Pressable> : <View style={styles.row}>{copy}</View>;
        }}
      />
      {selecting && <View style={styles.bottom}>
        <AppText variant="compactTitle" style={styles.summary} accessibilityLiveRegion="polite">{ids.length} {ids.length === 1 ? 'word' : 'words'} selected</AppText>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canContinue }} disabled={!canContinue} onPress={continueSelection} style={[styles.continue, !canContinue && styles.disabled]}>
          <AppText variant="button" color={colors.textOnPrimary}>Continue</AppText><ArrowRightIcon />
        </Pressable>
      </View>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.appBackground },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing[5], paddingVertical: spacing[3], gap: spacing[2] },
  headerButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing[1] },
  count: { alignItems: 'center', flex: 1 },
  scroll: { flex: 1 },
  list: { paddingHorizontal: spacing[5], paddingTop: spacing[2], paddingBottom: spacing[5], gap: 10, flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: radius.md, backgroundColor: '#16181D', minHeight: 76 },
  selectedRow: { backgroundColor: '#1E2128' },
  checkbox: { width: 24, height: 24, borderRadius: radius.full, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.cardBorder, alignItems: 'center', justifyContent: 'center' },
  checked: { backgroundColor: colors.primary, borderColor: colors.primary },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  ipa: { fontFamily: 'JetBrainsMono_400Regular', fontSize: 12, lineHeight: 16 },
  message: { padding: spacing[5], gap: spacing[2] },
  bottom: { margin: spacing[4], padding: spacing[3], borderRadius: radius.lg, backgroundColor: '#262A33', flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  summary: { flex: 1 },
  continue: { minHeight: 48, paddingHorizontal: spacing[5], borderRadius: radius.full, flexDirection: 'row', alignItems: 'center', gap: spacing[2], backgroundColor: colors.primary },
  disabled: { opacity: 0.45 },
});
