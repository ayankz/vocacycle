import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-screens/experimental';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '@/shared/theme/colors';
import { AppText } from '@/shared/ui/AppText';
import { ArrowRightIcon } from '@/shared/icons/ArrowRightIcon';
import { CheckIcon } from '@/shared/icons/CheckIcon';
import { ProfileIcon } from '@/shared/icons/ProfileIcon';
import { useVocabularyWords } from '@/features/vocabulary/hooks/use-vocabulary-words';
import { parseSelectedIds } from '../data/audio-sessions-api';
import { useCreateSession } from '../hooks/use-create-session';
import { createAudioStyles as styles } from './create-audio-styles';

const languages = [
  { code: 'EN', name: 'English', flag: '🇬🇧' },
  { code: 'RU', name: 'Russian', flag: '🇷🇺' },
  { code: 'ES', name: 'Spanish', flag: '🇪🇸' },
  { code: 'KO', name: 'Korean', flag: '🇰🇷' },
] as const;

function Pause({ down = false }: { down?: boolean }) {
  return <View style={styles.pause}>
    <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" accessible={false}>
      <Circle cx={12} cy={14} r={8} stroke={colors.primary} strokeWidth={2} />
      <Path d="M9 2h6M12 6V4m0 6v5" stroke={colors.primary} strokeWidth={2} />
    </Svg>
    <AppText style={styles.pauseText} color={colors.primary}>2s pause {down ? '↓' : '→'}</AppText>
  </View>;
}

function CadenceWord({ language, text }: { language: 'EN' | 'RU'; text: string }) {
  const russian = language === 'RU';
  return <View style={[styles.cadenceWord, russian && styles.russianWord]}>
    <AppText style={[styles.languageTag, russian && styles.russianTag]} color={russian ? colors.primary : colors.textSecondary}>{language}</AppText>
    <AppText style={styles.wordText} numberOfLines={1}>{text}</AppText>
  </View>;
}

export function CreateAudioScreen() {
  const { wordIds } = useLocalSearchParams<{ wordIds?: string }>();
  const ids = parseSelectedIds(wordIds);
  const { words, loading, refreshing, error, refresh } = useVocabularyWords();
  const selected = ids.map(id => words.find(word => word.id === id)).filter(word => word !== undefined);
  const [expanded, setExpanded] = useState(false);
  const [languagePicker, setLanguagePicker] = useState<'source' | 'target' | null>(null);
  const create = useCreateSession(id => router.replace({ pathname: '/audio/sessions/[id]', params: { id: String(id) } }));
  const invalidSelection = ids.length === 0 || ids.length > 20 || selected.length !== ids.length;
  const missingTranslation = selected.some(word => !word.translation?.trim());
  const valid = !invalidSelection && !missingTranslation && !loading && !refreshing && !error;
  const edit = () => router.navigate({ pathname: '/vocabulary', params: { mode: 'select', wordIds: JSON.stringify(ids) } });
  const countLabel = loading ? '…' : error ? '—' : String(selected.length);
  // Six seconds of silence plus roughly six seconds of speech per pair.
  // Actual audio durations are only available after generation.
  const seconds = selected.length * 12;
  const durationLabel = loading ? '…' : error || invalidSelection || missingTranslation ? '—'
    : seconds < 60 ? `~${seconds}s` : `~${Math.floor(seconds / 60)}m${seconds % 60 ? ` ${seconds % 60}s` : ''}`;
  const preview = !loading && !error ? selected[0] : undefined;
  const english = loading ? '…' : preview?.text ?? 'English word';
  const russian = loading ? '…' : preview?.translation?.trim() || 'Translation needed';

  return <SafeAreaView style={styles.screen} edges={{ top: true, bottom: true, left: true, right: true }}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Edit selected words" onPress={edit} disabled={create.busy} style={styles.back}>
        <ArrowRightIcon size={24} color={colors.textPrimary} />
      </Pressable>
      <View style={styles.headerCopy}>
        <AppText variant="sectionTitle">Create Audio</AppText>
        <AppText variant="caption" color={colors.textSecondary}>{ids.length} {ids.length === 1 ? 'word' : 'words'} selected · Pairs Mode</AppText>
      </View>
      <View style={styles.profile} accessible={false}><ProfileIcon color={colors.primary} /></View>
    </View>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="never"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}>
      <View style={styles.card}>
        <View style={styles.pairRow}>
          <View style={styles.pairPill}>
            <Pressable accessibilityRole="button" accessibilityLabel="Source language: English. View languages" onPress={() => setLanguagePicker('source')} disabled={create.busy} style={styles.languageButton}>
              <AppText style={styles.flag}>🇬🇧</AppText><AppText style={styles.languageName}>English</AppText>
            </Pressable>
            <AppText color={colors.primary} style={styles.swap} accessible={false}>⇄</AppText>
            <Pressable accessibilityRole="button" accessibilityLabel="Translation language: Russian. View languages" onPress={() => setLanguagePicker('target')} disabled={create.busy} style={styles.languageButton}>
              <AppText style={styles.flag}>🇷🇺</AppText><AppText style={styles.languageName}>Russian</AppText>
            </Pressable>
          </View>
          <View style={styles.direction}>
            <AppText style={styles.badge} color={colors.primary}>EN → RU Active</AppText>
            <AppText style={styles.smallCaption} color={colors.textMuted}>Other pairs coming soon</AppText>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.titleRow}><AppText variant="cardTitle">Selected Words</AppText><AppText style={styles.countBadge} color={colors.primary}>{countLabel}</AppText></View>
          <Pressable accessibilityRole="button" onPress={edit} disabled={create.busy} style={styles.action}>
            <AppText variant="bodySmall" color={colors.primary}>Edit</AppText><ArrowRightIcon size={16} color={colors.primary} />
          </Pressable>
        </View>
        {loading && <View style={styles.loadingRow}><ActivityIndicator size="small" color={colors.primary} /><AppText variant="bodySmall" color={colors.textSecondary}>Loading selected words…</AppText></View>}
        {!!error && <View style={styles.message}>
          <AppText accessibilityRole="alert" variant="bodySmall" color={colors.error}>Could not load vocabulary. Pull to refresh or try again.</AppText>
          <Pressable accessibilityRole="button" onPress={() => void refresh()} disabled={refreshing} style={styles.action}><AppText variant="bodySmall" color={colors.primary}>Try again</AppText></Pressable>
        </View>}
        {!loading && !error && invalidSelection && <AppText accessibilityRole="alert" variant="bodySmall" color={colors.textSecondary}>
          {ids.length === 0 ? 'Choose words from your vocabulary to create an audio session.' : 'Choose 1–20 available words. Edit your selection to continue.'}
        </AppText>}
        {!loading && !error && missingTranslation && <AppText accessibilityRole="alert" variant="bodySmall" color={colors.error}>Some words need a Russian translation. Pull to refresh, or edit your selection.</AppText>}
        {!loading && !error && <View style={styles.chips}>
          {(expanded ? selected : selected.slice(0, 6)).map(word => <View key={word.id} style={styles.chip}><AppText style={styles.chipText}>{word.text}</AppText></View>)}
          {!expanded && selected.length > 6 && <Pressable accessibilityRole="button" accessibilityLabel="Show all selected words" onPress={() => setExpanded(true)} style={styles.moreChip}>
            <AppText style={styles.chipText} color={colors.primary}>+{selected.length - 6} more</AppText>
          </Pressable>}
        </View>}
        {!loading && !error && ids.length === 0 && <Pressable accessibilityRole="button" onPress={edit} style={styles.action}><AppText variant="bodySmall" color={colors.primary}>Choose words →</AppText></Pressable>}
      </View>

      <View style={styles.card}>
        <View style={styles.cadenceHeading}>
          <View style={styles.titleRow}><AppText color={colors.primary} style={styles.repeat} accessible={false}>⇄</AppText><AppText variant="cardTitle">Pairs Audio Cadence</AppText></View>
          <AppText style={styles.badge} color={colors.primary}>3 × 2s pauses</AppText>
        </View>
        <View style={styles.cadence}>
          <View style={styles.cadenceRow}><CadenceWord language="EN" text={english} /><Pause /><CadenceWord language="RU" text={russian} /></View>
          <View style={styles.connector}><View style={styles.line} /><Pause down /><View style={styles.line} /></View>
          <View style={styles.cadenceRow}><CadenceWord language="RU" text={russian} /><Pause /><CadenceWord language="EN" text={english} /></View>
        </View>
        <AppText variant="bodySmall"><AppText variant="bodySmall" color={colors.primary}>Auditory cadence: </AppText>EN → 2s → RU → 2s → RU → 2s → EN.</AppText>
        <AppText variant="caption" color={colors.textSecondary}>Listen in both directions, then continue with the next word in your selection.</AppText>
      </View>

      <View style={[styles.card, styles.summary]}>
        <View style={styles.row}><AppText variant="compactTitle">Your Audio Session</AppText><CheckIcon size={20} color={colors.primary} /></View>
        <View style={styles.totals}>
          {[['Words', `${countLabel} ${selected.length === 1 ? 'word' : 'words'}`], ['Audio Mode', 'Pairs'], ['Est. Duration', durationLabel]].map(([label, value], index) => <View key={label} style={[styles.total, index > 0 && styles.totalDivider]}>
            <AppText style={styles.totalLabel} color={colors.textSecondary}>{label}</AppText>
            <AppText variant="compactTitle" style={index === 2 ? styles.mono : undefined} color={index === 2 ? colors.primary : colors.textPrimary}>{value}</AppText>
          </View>)}
        </View>
        <AppText style={styles.summaryNote} color={colors.textSecondary}>About 12 seconds per pair. Actual duration is available after generation.</AppText>
      </View>

      {!!create.error && <AppText accessibilityRole="alert" variant="bodySmall" color={colors.error}>{create.error}</AppText>}
      <View style={styles.footer}>
        <Pressable accessibilityRole="button" accessibilityLabel="Generate Audio" accessibilityState={{ disabled: !valid || create.busy, busy: create.busy }} disabled={!valid || create.busy}
          onPress={() => { if (valid) void create.generate({ wordIds: ids }); }}
          style={({ pressed }) => [styles.primary, (!valid || create.busy) && styles.disabled, pressed && styles.pressed]}>
          {create.busy ? <ActivityIndicator color={colors.textOnPrimary} /> : <View style={styles.wave} accessible={false}>
            {[9, 18, 25, 18, 9].map((height, index) => <View key={index} style={[styles.waveBar, { height }]} />)}
          </View>}
          <AppText variant="button" style={styles.generateText} color={colors.textOnPrimary}>{create.busy ? 'Creating session…' : 'Generate Audio'}</AppText>
        </Pressable>
        <AppText variant="caption" style={styles.note} color={colors.textSecondary}>One continuous recording for repeated listening.</AppText>
      </View>
    </ScrollView>

    <Modal visible={languagePicker !== null} transparent animationType="fade" onRequestClose={() => setLanguagePicker(null)}>
      <View style={styles.modalBackdrop}>
        <Pressable style={styles.dismissArea} accessibilityRole="button" accessibilityLabel="Close language options" onPress={() => setLanguagePicker(null)} />
        <View style={styles.languageSheet} accessibilityViewIsModal>
          <View style={styles.row}><AppText variant="sectionTitle">{languagePicker === 'source' ? 'Source language' : 'Translation language'}</AppText>
            <Pressable accessibilityRole="button" accessibilityLabel="Close language options" onPress={() => setLanguagePicker(null)} style={styles.action}><AppText color={colors.primary}>Done</AppText></Pressable>
          </View>
          <AppText variant="bodySmall" color={colors.textSecondary}>EN → RU is the available pair. Other combinations are coming soon.</AppText>
          {languages.map(language => {
            const active = language.code === (languagePicker === 'source' ? 'EN' : 'RU');
            return <Pressable key={language.code} accessibilityRole="radio" accessibilityLabel={`${language.name}, ${language.code}, ${active ? 'selected' : 'coming soon'}`} accessibilityState={{ selected: active, disabled: !active }} disabled={!active}
              onPress={() => setLanguagePicker(null)} style={[styles.languageOption, active && styles.activeLanguage]}>
              <View style={styles.titleRow}><AppText>{language.flag}</AppText><AppText variant="bodySmall">{language.name}</AppText><AppText style={styles.mono} color={colors.textSecondary}>{language.code}</AppText></View>
              {active ? <CheckIcon color={colors.primary} /> : <AppText variant="caption" color={colors.textMuted}>Coming soon</AppText>}
            </Pressable>;
          })}
        </View>
      </View>
    </Modal>
  </SafeAreaView>;
}
