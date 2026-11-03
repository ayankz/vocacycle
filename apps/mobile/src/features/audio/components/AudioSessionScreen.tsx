import { useCallback } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-screens/experimental';
import Svg, { Circle } from 'react-native-svg';
import { AppText } from '@/shared/ui/AppText';
import { colors } from '@/shared/theme/colors';
import { ArrowRightIcon } from '@/shared/icons/ArrowRightIcon';
import { CheckIcon } from '@/shared/icons/CheckIcon';
import { PlayIcon } from '@/shared/icons/PlayIcon';
import { ProfileIcon } from '@/shared/icons/ProfileIcon';
import { PronunciationSpinner } from '@/features/home/components/PronunciationSpinner';
import type { AudioSession } from '../data/audio-sessions-api';
import { useSessionStatus } from '../hooks/use-session-status';
import { sessionStyles as styles } from './session-styles';

type SessionView = 'generating' | 'ready' | 'library';
const stages = [
  { key: 'queued', label: 'Preparing vocabulary' },
  { key: 'speech', label: 'Generating English & Russian audio' },
  { key: 'assembly', label: 'Assembling your recording' },
  { key: 'ready', label: 'Ready to listen' },
];

function durationLabel(milliseconds: number | null) {
  if (milliseconds === null || !Number.isFinite(milliseconds) || milliseconds <= 0) return 'Duration pending';
  const seconds = Math.floor(milliseconds / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m${seconds % 60 ? ` ${seconds % 60}s` : ''}`;
}

function sessionMeta(session: AudioSession) {
  return `${session.words.length} ${session.words.length === 1 ? 'word' : 'words'} · ${session.examplesPerWord === 0 ? 'Pairs' : 'Audio session'} · ${durationLabel(session.durationMs)}`;
}

function Waveform({ small = false }: { small?: boolean }) {
  return <View style={[styles.waveform, small && styles.compactWaveform]} accessible={false}>
    {[28, 50, 72, 59, 38, 22].map((height, index) => <View key={index} style={[styles.waveBar, { height: small ? height / 3 : height, width: small ? 2 : 6, backgroundColor: index === 3 ? colors.textPrimary : colors.primary, opacity: index === 5 ? 0.4 : 1 }]} />)}
  </View>;
}

function AudioArtwork({ ready, active, failed }: { ready: boolean; active: boolean; failed: boolean }) {
  return <View style={[styles.artwork, ready && styles.readyArtwork]} accessible={false}>
    <View style={styles.glow} />
    <Svg width="100%" height="100%" viewBox="0 0 208 208" style={styles.artworkRing}>
      <Circle cx={104} cy={104} r={96} fill="none" stroke={colors.cardBorder} strokeWidth={2} strokeDasharray="4 8" />
      <Circle cx={104} cy={104} r={79} fill="none" stroke={colors.surfaceElevated} strokeWidth={5} />
      {/* This decorative arc is indeterminate; it never represents a percentage. */}
      {!failed && <Circle cx={104} cy={104} r={79} fill="none" stroke={colors.primary} strokeWidth={5}
        strokeLinecap="round" strokeDasharray={ready ? undefined : '80 417'} rotation={-90} origin="104, 104" />}
    </Svg>
    <Waveform />
    {ready && <View style={[styles.artworkStatus, styles.readyArtworkStatus]}><CheckIcon size={19} color={colors.primary} /></View>}
    {active && <View style={styles.artworkStatus}><PronunciationSpinner /></View>}
    {failed && <AppText color={colors.error} style={styles.failureMark}>!</AppText>}
  </View>;
}

function SessionHeader({ title }: { title: string }) {
  return <View style={styles.header}>
    <Pressable accessibilityRole="button" accessibilityLabel="Go back" style={styles.back}
      onPress={() => router.canGoBack() ? router.back() : router.navigate('/audio')}>
      <ArrowRightIcon size={24} color={colors.textPrimary} />
    </Pressable>
    <AppText variant="sectionTitle" style={styles.headerTitle}>{title}</AppText>
    <View style={styles.profile} accessible={false}><ProfileIcon color={colors.textOnPrimary} /></View>
  </View>;
}

function SessionPreview({ session }: { session: AudioSession }) {
  const words = [...session.words].sort((a, b) => a.position - b.position);
  const first = words[0];
  return <View style={styles.previewCard}>
    <View style={styles.row}>
      <View style={styles.copy}>
        <AppText variant="sectionTitle">{words.length} {words.length === 1 ? 'Word' : 'Words'} · Session {session.id}</AppText>
        <AppText variant="bodySmall" color={colors.textSecondary}>{sessionMeta(session)}</AppText>
      </View>
      <View style={styles.smallWave} accessible={false}><Waveform small /></View>
    </View>
    {session.examplesPerWord === 0 && <View style={styles.cadenceTag}>
      <View style={styles.goldDot} /><AppText variant="caption" color={colors.textSecondary}>EN → 2s → RU → 2s → RU → 2s → EN</AppText>
    </View>}
    <View style={styles.wordPreview}>
      {first ? <>
        <View style={styles.wordRow}><AppText variant="sectionTitle" style={styles.previewWord}>{first.text}</AppText>
          {!!first.ipa && <AppText style={styles.phonetic} color={colors.textMuted}>{first.ipa}</AppText>}
        </View>
        <AppText variant="bodySmall" color={colors.textSecondary}>{first.translation || 'Translation unavailable'}</AppText>
        {words.length > 1 && <AppText variant="caption" color={colors.textMuted}>Then {words.slice(1, 4).map(word => word.text).join(', ')}{words.length > 4 ? ` and ${words.length - 4} more` : ''}</AppText>}
      </> : <AppText variant="bodySmall" color={colors.textSecondary}>Word preview unavailable.</AppText>}
    </View>
  </View>;
}

export function AudioSessionScreen({ id, view = 'generating' }: { id: number; view?: SessionView }) {
  const { session, loading, error, paused, refresh } = useSessionStatus(id);
  const ready = session?.status === 'ready';
  const failed = session?.status === 'failed';
  const generating = session?.status === 'pending' || session?.status === 'processing';
  const stageIndex = session?.status === 'pending' ? 0 : stages.findIndex(stage => stage.key === session?.stage);
  const stageLabel = failed ? 'Generation failed' : ready ? 'Ready to listen' : stages[stageIndex]?.label ?? 'Processing session';
  useFocusEffect(useCallback(() => {
    if (error || loading) return;
    if (view === 'generating' && ready) router.replace({ pathname: '/audio/ready/[id]', params: { id: String(id) } });
    else if (view === 'ready' && generating)
      router.replace({ pathname: '/audio/sessions/[id]', params: { id: String(id) } });
  }, [error, generating, id, loading, ready, view]));

  const library = () => router.navigate({ pathname: '/audio', params: { sessionId: String(id) } });
  const title = view === 'library' ? 'Audio Library' : view === 'ready' && ready ? 'Audio Session Detail' : failed ? 'Generation failed' : 'Generating Audio';
  return <SafeAreaView style={styles.screen} edges={{ top: true, bottom: true, left: true, right: true }}>
    <SessionHeader title={title} />
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="never">
      {view !== 'library' && <View style={styles.hero}>
        <AudioArtwork ready={view === 'ready' && ready} active={(loading || generating) && !paused && !error} failed={failed} />
        <AppText variant="pageTitle" style={styles.heroTitle}>{failed ? 'Audio could not be created' : error && !session ? 'Could not load your session' : loading ? 'Checking your audio' : ready && view === 'ready' ? 'Your audio is ready' : 'Creating your audio'}</AppText>
        {session && <AppText color={colors.textSecondary} style={styles.center}>{sessionMeta(session)}</AppText>}
        {ready && view === 'ready' && <View style={styles.notice}><CheckIcon color={colors.primary} /><AppText variant="caption" color={colors.textSecondary}>Saved audio session · Ready to listen</AppText></View>}
        {generating && <View style={styles.notice}><AppText color={colors.primary}>↻</AppText><AppText variant="caption" color={colors.textSecondary}>Creation continues on the server if you leave</AppText></View>}
      </View>}
      {view === 'library' && loading && <View style={styles.loading}><ActivityIndicator color={colors.primary} /><AppText color={colors.textSecondary}>Loading session…</AppText></View>}
      {!!error && <View style={styles.errorCard}><AppText accessibilityRole="alert" variant="bodySmall" color={colors.error}>{error}</AppText></View>}
      {failed && <View style={styles.errorCard}><AppText accessibilityRole="alert" variant="bodySmall" color={colors.error}>{session.error || 'Generation failed. No automatic regeneration was attempted.'}</AppText></View>}
      {paused && generating && !error && <AppText variant="bodySmall" color={colors.textSecondary}>Automatic status checks paused. Generation may still be running. Check status to refresh.</AppText>}
      {(error || paused) && <Pressable accessibilityRole="button" onPress={() => void refresh()} style={styles.secondary}><AppText color={colors.primary}>Check status</AppText></Pressable>}

      {view === 'generating' && session && !failed && !ready && <>
        <View style={styles.row}><AppText variant="bodySmall" color={colors.textSecondary}>Generation status</AppText><AppText style={styles.stageLabel} color={colors.primary}>{error || paused ? 'Checks paused' : stageLabel}</AppText></View>
        <View style={styles.stages}>
          {stages.map((stage, index) => {
            const complete = stageIndex >= 0 && index < stageIndex;
            const active = index === stageIndex;
            return <View key={stage.key} style={[styles.stage, active && styles.activeStage]}>
              <View style={[styles.stageDot, (complete || active) && styles.goldStageDot]}>
                {complete ? <CheckIcon size={16} color={colors.primary} /> : active && !paused && !error ? <ActivityIndicator size="small" color={colors.primary} /> : <View style={styles.pendingDot} />}
              </View>
              <AppText variant="body" style={styles.stageCopy} color={active ? colors.primary : complete ? colors.textPrimary : colors.textMuted}>{stage.label}</AppText>
              {active && <AppText variant="caption" color={colors.primary}>{paused || error ? 'Paused' : 'Active'}</AppText>}
            </View>;
          })}
        </View>
      </>}

      {view === 'ready' && ready && session && <>
        <SessionPreview session={session} />
        <Pressable accessibilityRole="button" accessibilityLabel="Play Audio Now" disabled={!session.audioUrl || !!error}
          onPress={() => router.push({ pathname: '/audio/player/[id]', params: { id: String(id) } })}
          style={[styles.primary, (!session.audioUrl || !!error) && styles.disabled]}>
          <PlayIcon size={22} color={colors.textOnPrimary} /><AppText variant="button" color={colors.textOnPrimary}>Play Audio Now</AppText>
          {session.durationMs !== null && <AppText style={styles.duration} color={colors.textOnPrimary}>({durationLabel(session.durationMs)})</AppText>}
        </Pressable>
        {!session.audioUrl && <AppText accessibilityRole="alert" variant="bodySmall" color={colors.error}>The recording is unavailable. Check status to try again.</AppText>}
        {!session.audioUrl && !error && <Pressable accessibilityRole="button" onPress={() => void refresh()} style={styles.secondary}><AppText color={colors.primary}>Check status</AppText></Pressable>}
        <Pressable accessibilityRole="button" onPress={library} style={styles.secondary}><AppText variant="body">View in Audio Library</AppText></Pressable>
      </>}
      {view === 'library' && <>
        <AppText variant="bodySmall" color={colors.textSecondary}>Your current session. Browsing all saved sessions is not available yet.</AppText>
        {session && <><SessionPreview session={session} />
          <Pressable accessibilityRole="button" onPress={() => router.push(ready
            ? { pathname: '/audio/player/[id]', params: { id: String(id) } }
            : { pathname: '/audio/sessions/[id]', params: { id: String(id) } })} style={styles.secondary}><AppText color={colors.primary}>{ready ? 'Play Audio' : failed ? 'View failure details' : 'Check generation'}</AppText></Pressable>
        </>}
      </>}
      {failed && <Pressable accessibilityRole="button" onPress={() => router.replace({ pathname: '/audio/create', params: { wordIds: JSON.stringify(session.wordIds) } })} style={styles.primary}><AppText variant="button" color={colors.textOnPrimary}>Edit session selection</AppText></Pressable>}
      {view === 'generating' && <>
        <Pressable accessibilityRole="button" onPress={() => router.navigate('/')} style={styles.continueButton}>
          <AppText color={colors.primary}>◇</AppText><AppText variant="button" style={styles.copy}>Continue using VocaCycle</AppText><ArrowRightIcon size={20} color={colors.textSecondary} />
        </Pressable>
        <Pressable accessibilityRole="button" onPress={library} style={styles.action}><AppText variant="caption" color={colors.textSecondary}>Return to this session in the Audio tab</AppText></Pressable>
      </>}
    </ScrollView>
  </SafeAreaView>;
}
