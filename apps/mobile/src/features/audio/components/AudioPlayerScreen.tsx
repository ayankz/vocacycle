import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View, type GestureResponderEvent } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-screens/experimental';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { AppText } from '@/shared/ui/AppText';
import { colors } from '@/shared/theme/colors';
import { ArrowRightIcon } from '@/shared/icons/ArrowRightIcon';
import { PlayIcon } from '@/shared/icons/PlayIcon';
import { SessionSelector } from './SessionSelector';
import { getAudioTimeline, type AudioSession, type AudioTimelineEntry } from '../data/audio-sessions-api';
import { useSessionStatus } from '../hooks/use-session-status';
import { useSessionPlayback } from '../hooks/use-session-playback';
import { playerStyles as styles } from './player-styles';

function time(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60).toString().padStart(2, '0')}:${(whole % 60).toString().padStart(2, '0')}`;
}

function useTimeline(id: number) {
  const [state, setState] = useState<{ entries: AudioTimelineEntry[]; loading: boolean; error: string | null }>({ entries: [], loading: true, error: null });
  const [attempt, setAttempt] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    const request = new AbortController();
    setState({ entries: [], loading: true, error: null });
    const timeout = setTimeout(() => {
      request.abort();
      if (active) setState({ entries: [], loading: false, error: 'Timeline loading timed out. Try again.' });
    }, 10_000);
    void getAudioTimeline(id, request.signal).then(entries => {
      if (active && !request.signal.aborted) setState({ entries, loading: false, error: null });
    }).catch(error => {
      if (active && !request.signal.aborted) setState({ entries: [], loading: false, error: error instanceof Error ? error.message : 'Could not load the timeline.' });
    }).finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); request.abort(); };
  }, [id, attempt]));
  return { ...state, retry: () => setAttempt(value => value + 1) };
}

function SkipWordIcon({ next = false }: { next?: boolean }) {
  return <Svg width={22} height={22} viewBox="0 0 24 24" rotation={next ? 180 : 0} origin="12, 12">
    <Path d="M6 5v14" stroke={colors.textPrimary} strokeWidth={2} />
    <Path d="m19 5-10 7 10 7V5Z" fill={colors.textPrimary} />
  </Svg>;
}

function PlayerHeader({ id, session }: { id: number; session: AudioSession | null }) {
  return <View style={styles.header}>
    <Pressable accessibilityRole="button" accessibilityLabel="Go back" style={styles.back} onPress={() => router.canGoBack() ? router.back() : router.navigate('/audio')}>
      <ArrowRightIcon size={24} color={colors.textPrimary} />
    </Pressable>
    <SessionSelector id={id} session={session} />
    <View style={styles.headerSpacer} />
  </View>;
}

function ReadyPlayer({ session }: { session: AudioSession }) {
  const playback = useSessionPlayback(session.id);
  const timeline = useTimeline(session.id);
  const [seekWidth, setSeekWidth] = useState(0);
  const [scrubPosition, setScrubPosition] = useState<number | null>(null);
  const scrub = useRef<number | null>(null);
  const words = [...session.words].sort((a, b) => a.position - b.position);
  const duration = session.durationMs != null && session.durationMs > 0 ? session.durationMs / 1000 : playback.duration;
  const position = Math.min(playback.position, duration || playback.position);
  const shownPosition = scrubPosition ?? position;
  const progress = duration > 0 ? Math.min(1, Math.max(0, shownPosition / duration)) : 0;
  const segmentIndex = timeline.entries.findIndex(entry => entry.startMs <= position * 1000 && entry.endMs > position * 1000);
  const segment = timeline.entries[segmentIndex];
  const currentIndex = segment ? words.findIndex(word => word.wordId === segment.wordId) : -1;
  const currentWord = words[currentIndex];
  const silence = segment?.kind === 'recall-pause' || segment?.kind === 'transition';
  const speaking = playback.playing && !playback.buffering && !playback.seeking && !silence;
  const starts = words.map(word => timeline.entries.find(entry => entry.wordId === word.wordId)?.startMs);
  const canSeek = playback.loaded && !playback.error && !playback.seeking && duration > 0;
  const activeLabel = playback.error ? 'Playback unavailable' : playback.seeking ? 'Seeking…' : playback.buffering ? 'Buffering…' : !playback.loaded ? 'Loading audio…'
    : !playback.playing ? position >= duration && duration > 0 ? 'Session complete' : 'Paused' : silence ? 'Recall pause' : segment?.language === 'ru' ? 'RU · Russian translation' : segment?.language === 'en' ? 'EN · English word' : 'Playing audio';
  const segmentEnglish = currentWord && timeline.entries.find(entry => entry.wordId === currentWord.wordId && entry.kind === 'word' && entry.language === 'en')?.text;
  const segmentRussian = currentWord && timeline.entries.find(entry => entry.wordId === currentWord.wordId && entry.kind === 'word-translation' && entry.language === 'ru')?.text;
  const pauseRequested = playback.playing || (playback.playRequested && playback.buffering);
  const previousIndex = currentIndex >= 0 ? currentIndex - 1 : position > 0 ? words.length - 1 : -1;
  const nextIndex = currentIndex >= 0 ? currentIndex + 1 : position === 0 ? 0 : words.length;
  const goToWord = (index: number) => { const start = starts[index]; if (canSeek && start !== undefined) void playback.seek(start / 1000); };
  const beginScrub = (event: GestureResponderEvent) => {
    if (!canSeek || seekWidth <= 0) return;
    const value = Math.min(1, Math.max(0, event.nativeEvent.locationX / seekWidth)) * duration;
    scrub.current = value; setScrubPosition(value);
  };
  const endScrub = () => {
    const value = scrub.current;
    scrub.current = null; setScrubPosition(null);
    if (value !== null && canSeek) void playback.seek(value);
  };

  return <>
    <View style={styles.sessionInfo}>
      <View style={styles.pairBanner}><AppText variant="caption" color={colors.textSecondary}>🇬🇧 EN <AppText variant="caption" color={colors.primary}>➜</AppText> 🇷🇺 RU · <AppText variant="caption" color={colors.primary}>Pairs Mode</AppText></AppText></View>
      <AppText style={styles.wordPosition} color={colors.textMuted}>{currentIndex >= 0 ? `Word ${currentIndex + 1} of ${words.length} · ${segmentEnglish || currentWord?.text}` : `${words.length} words · ${duration > 0 ? time(duration) : 'Loading duration…'}`}</AppText>
    </View>
    <View style={styles.halo} accessible={false}>
      <View style={styles.haloGlow} />
      <Svg width={170} height={170} viewBox="0 0 190 190" style={styles.haloRing}>
        <Circle cx={95} cy={95} r={82} fill="none" stroke={colors.cardBorder} strokeWidth={3} />
        <Circle cx={95} cy={95} r={82} fill="none" stroke={colors.primary} strokeWidth={3} strokeLinecap="round" strokeDasharray="515.22" strokeDashoffset={515.22 * (1 - progress)} rotation={-90} origin="95, 95" />
      </Svg>
      <View style={styles.haloCenter}>
        {playback.buffering || !playback.loaded && !playback.error ? <ActivityIndicator size="large" color={colors.primary} /> : <View style={styles.wave}>
          {[16, 28, 40, 32, 48, 36, 44, 24, 14].map((height, index) => <View key={index} style={[styles.waveBar, { height, opacity: speaking ? 1 : 0.35 }]} />)}
        </View>}
      </View>
    </View>
    <View style={styles.currentWord}>
      <AppText style={styles.wordBadge} color={colors.primary} accessibilityLiveRegion="polite">{speaking && segment ? `NOW SPEAKING: ${segment.language === 'en' ? 'ENGLISH (SOURCE)' : 'RUSSIAN (TRANSLATION)'}` : activeLabel}</AppText>
      <AppText style={styles.wordTitle} color={speaking && segment?.language === 'en' ? colors.primary : colors.textPrimary}>{segmentEnglish || currentWord?.text || 'Your audio session'}</AppText>
      {!!currentWord?.ipa && <AppText style={styles.phonetic} color={colors.primary}>{currentWord.ipa}</AppText>}
      <AppText style={styles.translation} color={speaking && segment?.language === 'ru' ? colors.primary : colors.textSecondary}>{segmentRussian || currentWord?.translation || (timeline.loading ? 'Loading word and translation…' : 'Use the timeline to follow each word.')}</AppText>
    </View>

    {!!playback.error && <View style={styles.message}><AppText accessibilityRole="alert" variant="bodySmall" color={colors.error}>{playback.error}</AppText>
      <Pressable accessibilityRole="button" onPress={playback.retry} style={styles.action}><AppText color={colors.primary}>Retry playback</AppText></Pressable>
    </View>}
    {!!timeline.error && <View style={styles.message}><AppText accessibilityRole="alert" variant="bodySmall" color={colors.error}>{timeline.error} Audio controls remain available; word highlighting and word navigation need the timeline.</AppText>
      <Pressable accessibilityRole="button" onPress={timeline.retry} style={styles.action}><AppText color={colors.primary}>Reload timeline</AppText></Pressable>
    </View>}

    <View>
      <View style={styles.seekTouch} onLayout={event => setSeekWidth(event.nativeEvent.layout.width)}
        accessible accessibilityRole="adjustable" accessibilityLabel="Playback position" accessibilityState={{ disabled: !canSeek }}
        accessibilityValue={{ min: 0, max: Math.max(0, Math.floor(duration)), now: Math.floor(shownPosition), text: `${time(shownPosition)} of ${time(duration)}` }}
        accessibilityActions={[{ name: 'increment', label: 'Seek forward 15 seconds' }, { name: 'decrement', label: 'Seek back 15 seconds' }]}
        onAccessibilityAction={event => { if (canSeek) void playback.seek(position + (event.nativeEvent.actionName === 'increment' ? 15 : -15)); }}
        onStartShouldSetResponder={() => canSeek} onMoveShouldSetResponder={() => canSeek}
        onResponderGrant={beginScrub} onResponderMove={beginScrub} onResponderRelease={endScrub}
        onResponderTerminate={() => { scrub.current = null; setScrubPosition(null); }}>
        <View style={styles.seekTrack} pointerEvents="none"><View style={[styles.seekFill, { width: `${progress * 100}%` }]} /></View>
        <View pointerEvents="none" style={[styles.scrubber, { left: `${progress * 100}%` }]} />
      </View>
      <View style={styles.row}><AppText style={styles.timecode} color={colors.textSecondary}>{time(shownPosition)}</AppText><AppText style={styles.cadencePosition} color={colors.textMuted}>{currentIndex >= 0 ? `WORD ${currentIndex + 1}/${words.length}${silence ? ' · PAUSE' : ''}` : ''}</AppText><AppText style={styles.timecode} color={colors.textSecondary}>{duration > 0 ? time(duration) : '—'}</AppText></View>
    </View>

    <View style={styles.controls}>
      <Pressable accessibilityRole="button" accessibilityLabel="Replay current word" disabled={!canSeek || currentIndex < 0} onPress={() => goToWord(currentIndex)} style={[styles.control, (!canSeek || currentIndex < 0) && styles.disabled]}><AppText style={styles.replayIcon} color={colors.textSecondary}>↶</AppText></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Previous word" disabled={!canSeek || previousIndex < 0 || starts[previousIndex] === undefined} onPress={() => goToWord(previousIndex)} style={[styles.control, (!canSeek || previousIndex < 0) && styles.disabled]}><SkipWordIcon /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={pauseRequested ? 'Pause audio' : 'Play audio'} accessibilityState={{ disabled: !playback.loaded || playback.seeking || !!playback.error }}
        disabled={!playback.loaded || playback.seeking || !!playback.error} onPress={() => void playback.toggle()} style={[styles.playButton, (!playback.loaded || !!playback.error) && styles.disabled]}>
        {playback.seeking ? <ActivityIndicator color={colors.textOnPrimary} /> : pauseRequested ? <Svg width={30} height={30} viewBox="0 0 24 24"><Rect x={6} y={4} width={4} height={16} fill={colors.textOnPrimary} /><Rect x={14} y={4} width={4} height={16} fill={colors.textOnPrimary} /></Svg> : <PlayIcon size={32} color={colors.textOnPrimary} />}
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Next word" disabled={!canSeek || nextIndex >= words.length || starts[nextIndex] === undefined} onPress={() => goToWord(nextIndex)} style={[styles.control, (!canSeek || nextIndex >= words.length) && styles.disabled]}><SkipWordIcon next /></Pressable>
    </View>
    <View style={styles.settingsRow}>
      <View style={styles.speedPill}>{[0.75, 1, 1.25, 1.5].map(rate => <Pressable key={rate} accessibilityRole="radio" accessibilityLabel={`${rate} times playback speed`} accessibilityState={{ selected: playback.rate === rate }} onPress={() => playback.setRate(rate)} style={[styles.speedOption, playback.rate === rate && styles.activeSpeed]}><AppText style={styles.speedText} color={playback.rate === rate ? colors.primary : colors.textSecondary}>{rate}×</AppText></Pressable>)}</View>
    </View>

    <View style={styles.segmentCard}>
      <View style={styles.row}><AppText style={styles.segmentLabel} color={colors.textSecondary}>REPEAT SESSION</AppText><AppText color={colors.textMuted}>⇄</AppText></View>
      <View style={styles.repeatRow}>
        <Pressable accessibilityRole="radio" accessibilityState={{ selected: !playback.loop }} onPress={() => { if (playback.loop) playback.toggleLoop(); }} style={[styles.repeatChip, !playback.loop && styles.repeatSelected]}><AppText variant="button" color={!playback.loop ? colors.textOnPrimary : colors.textSecondary}>1×</AppText></Pressable>
        <Pressable accessibilityRole="radio" accessibilityLabel="Loop session continuously" accessibilityState={{ selected: playback.loop }} onPress={() => { if (!playback.loop) playback.toggleLoop(); }} style={[styles.repeatChip, playback.loop && styles.repeatSelected]}><AppText variant="button" color={playback.loop ? colors.textOnPrimary : colors.textSecondary}>∞ Loop</AppText></Pressable>
      </View>
      <AppText variant="bodySmall" style={styles.center} color={colors.textMuted}>{playback.loop ? 'Continuous cycling · Reuses this recording' : `One session${duration > 0 ? ` · ${time(duration)} total listening` : ''}`}</AppText>
    </View>

    <AppText variant="caption" style={styles.center} color={colors.textMuted}>{playback.lockScreenWarning || 'Background and lock-screen playback requires an audio-enabled development build.'}</AppText>
  </>;
}

export function AudioPlayerScreen({ id }: { id: number }) {
  const { session, loading, error, paused, refresh } = useSessionStatus(id);
  const pending = session?.status === 'pending' || session?.status === 'processing';
  useFocusEffect(useCallback(() => {
    if (pending && !error) router.replace({ pathname: '/audio/sessions/[id]', params: { id: String(id) } });
  }, [id, pending, error]));
  return <SafeAreaView style={styles.screen} edges={{ top: true, bottom: true, left: true, right: true }}>
    <PlayerHeader id={id} session={session} />
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="never">
      {loading && <View style={styles.loading}><ActivityIndicator color={colors.primary} /><AppText color={colors.textSecondary}>Loading audio session…</AppText></View>}
      {!!error && <AppText accessibilityRole="alert" variant="bodySmall" color={colors.error}>{error}</AppText>}
      {(error || paused) && <Pressable accessibilityRole="button" onPress={() => void refresh()} style={styles.action}><AppText color={colors.primary}>Check session status</AppText></Pressable>}
      {session?.status === 'ready' && session.audioUrl && <ReadyPlayer key={id} session={session} />}
      {session?.status === 'ready' && !session.audioUrl && <View style={styles.message}><AppText color={colors.error}>The recording is unavailable.</AppText><Pressable accessibilityRole="button" onPress={() => void refresh()} style={styles.action}><AppText color={colors.primary}>Check again</AppText></Pressable></View>}
      {session?.status === 'failed' && <View style={styles.message}><AppText accessibilityRole="alert" color={colors.error}>{session.error || 'This session could not be generated.'}</AppText>
        <Pressable accessibilityRole="button" onPress={() => router.replace({ pathname: '/audio/create', params: { wordIds: JSON.stringify(session.wordIds) } })} style={styles.action}><AppText color={colors.primary}>Edit selection</AppText></Pressable>
      </View>}
    </ScrollView>
  </SafeAreaView>;
}
