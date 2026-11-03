import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-screens/experimental';
import { AppText } from '@/shared/ui/AppText';
import { CheckIcon } from '@/shared/icons/CheckIcon';
import { colors } from '@/shared/theme/colors';
import { getReadyAudioSessions, type AudioSession, type ReadySessionOption } from '../data/audio-sessions-api';
import { playerStyles as styles } from './player-styles';

export function SessionSelector({ id, session }: { id: number; session: AudioSession | null }) {
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [items, setItems] = useState<ReadySessionOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let active = true;
    const request = new AbortController();
    setLoading(true); setError(null); setItems([]);
    const timeout = setTimeout(() => {
      request.abort();
      if (active) { setLoading(false); setError('Loading sessions timed out. Try again.'); }
    }, 10_000);
    void getReadyAudioSessions(request.signal).then(sessions => {
      if (active && !request.signal.aborted) setItems([...new Map(sessions.map(item => [item.id, item])).values()]);
    }).catch(reason => {
      if (active && !request.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not load sessions.');
    }).finally(() => { clearTimeout(timeout); if (active && !request.signal.aborted) setLoading(false); });
    return () => { active = false; clearTimeout(timeout); request.abort(); };
  }, [open, attempt]);
  const options = session?.status === 'ready' && !items.some(item => item.id === id)
    ? [{ id, wordCount: session.words.length, durationMs: session.durationMs }, ...items] : items;
  const title = session ? `${session.words.length} Words · Session ${id}` : `Session ${id}`;
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="Select audio session" accessibilityState={{ expanded: open }} onPress={() => setOpen(true)} style={styles.sessionSelector}>
      <View style={styles.copy}><AppText style={styles.selectorTitle} numberOfLines={1}>{title}</AppText><AppText style={styles.selectorPair} color={colors.primary}>EN → RU</AppText></View>
      <AppText color={colors.textSecondary}>⌄</AppText>
    </Pressable>
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
      <View style={styles.sheetBackdrop}>
        <Pressable style={styles.sheetDismiss} accessibilityRole="button" accessibilityLabel="Close session selector" onPress={() => setOpen(false)} />
        <SafeAreaView style={styles.sessionSheet} edges={{ bottom: true, left: true, right: true }} accessibilityViewIsModal>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeading}><AppText variant="sectionTitle">Select Session</AppText><Pressable accessibilityRole="button" accessibilityLabel="Close session selector" onPress={() => setOpen(false)} style={styles.headerAction}><AppText color={colors.textSecondary}>✕</AppText></Pressable></View>
          <ScrollView contentContainerStyle={styles.sessionOptions}>
            {loading && <ActivityIndicator color={colors.primary} />}
            {!!error && <View style={styles.message}><AppText accessibilityRole="alert" variant="bodySmall" color={colors.textSecondary}>{error}</AppText><Pressable accessibilityRole="button" onPress={() => setAttempt(value => value + 1)} style={styles.action}><AppText color={colors.primary}>Try again</AppText></Pressable></View>}
            {!loading && !error && options.length === 0 && <AppText color={colors.textSecondary}>No ready sessions are available.</AppText>}
            {options.map(item => <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ selected: item.id === id }}
              onPress={() => { setOpen(false); if (item.id !== id) router.replace({ pathname: '/audio/player/[id]', params: { id: String(item.id) } }); }}
              style={[styles.sessionOption, item.id === id && styles.selectedWord]}>
              <View style={styles.copy}><AppText variant="compactTitle">{item.wordCount !== null ? `${item.wordCount} Words · ` : ''}Session {item.id}</AppText>
                <AppText variant="caption" color={colors.textSecondary}>EN → RU{item.durationMs !== null ? ` · ${Math.floor(item.durationMs / 60_000)}m ${Math.floor(item.durationMs / 1000) % 60}s` : ''}</AppText>
              </View>{item.id === id && <CheckIcon size={18} color={colors.primary} />}
            </Pressable>)}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  </>;
}
