import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SearchIcon } from '@/shared/icons/SearchIcon';
import { AppText } from '@/shared/ui/AppText';
import { colors } from '@/shared/theme/colors';
import { radius } from '@/shared/theme/radius';
import { spacing } from '@/shared/theme/spacing';
import type { VocabularyFilter } from '../data/filters';

type Props = {
  query: string;
  onQueryChange: (query: string) => void;
  filter: VocabularyFilter;
  onFilterChange: (filter: VocabularyFilter) => void;
  count: number | null;
  notInAudioCount: number | null;
  loading: boolean;
};

export function VocabularyControls({ query, onQueryChange, filter, onFilterChange, count, notInAudioCount, loading }: Props) {
  const chips: { key: VocabularyFilter; label: string; disabled?: boolean }[] = [
    { key: 'all', label: `All (${loading ? '…' : count ?? '—'})` },
    { key: 'recent', label: 'Recent' },
    { key: 'not-in-audio', label: `Not in Audio (${loading ? '…' : notInAudioCount ?? '—'})`, disabled: loading || notInAudioCount === null },
  ];
  return <View style={styles.controls}>
    <View style={styles.search}>
      <SearchIcon color={colors.textMuted} />
      <TextInput accessibilityLabel="Search vocabulary or translation" placeholder="Search vocabulary or translation…" placeholderTextColor={colors.textMuted}
        value={query} onChangeText={onQueryChange} autoCapitalize="none" autoCorrect={false} returnKeyType="search" style={styles.input} selectionColor={colors.primary} />
      {!!query && <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => onQueryChange('')} hitSlop={8}><AppText color={colors.textSecondary}>×</AppText></Pressable>}
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {chips.map(chip => <Pressable key={chip.key} accessibilityRole="button" accessibilityLabel={chip.label}
        accessibilityState={{ selected: filter === chip.key, disabled: !!chip.disabled }} disabled={chip.disabled}
        onPress={() => onFilterChange(chip.key)} style={[styles.chip, filter === chip.key && styles.activeChip]}>
        <AppText variant="bodySmall" color={filter === chip.key ? colors.primary : colors.textSecondary}>{chip.label}</AppText>
      </Pressable>)}
    </ScrollView>
    {!loading && notInAudioCount === null && <AppText variant="caption" color={colors.textCaption}>Audio session membership unavailable.</AppText>}
  </View>;
}

const styles = StyleSheet.create({
  controls: { paddingHorizontal: spacing[5], gap: spacing[3], paddingBottom: spacing[2] },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingHorizontal: spacing[3], paddingVertical: spacing[2], minHeight: 44, borderRadius: radius.md, backgroundColor: colors.surface },
  input: { flex: 1, minWidth: 0, fontFamily: 'SpaceGrotesk_400Regular', fontSize: 15, color: colors.textPrimary, paddingVertical: spacing[1] },
  chips: { gap: spacing[2] },
  chip: { borderRadius: radius.full, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 10, minHeight: 44, justifyContent: 'center' },
  activeChip: { backgroundColor: colors.surfaceElevated },
});
