import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { createAudioSession, newRequestId, type SessionSettings } from '../data/audio-sessions-api';

type Settings = Omit<SessionSettings, 'requestId'>;
export function useCreateSession(onCreated: (id: number) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(false);
  const request = useRef<AbortController | null>(null);
  const intent = useRef<{ fingerprint: string; id: string } | null>(null);
  useFocusEffect(useCallback(() => {
    active.current = true;
    setBusy(false);
    return () => { active.current = false; request.current?.abort(); request.current = null; };
  }, []));
  const generate = async (settings: Settings) => {
    if (!active.current || request.current) return;
    const fingerprint = JSON.stringify(settings);
    if (intent.current?.fingerprint !== fingerprint) intent.current = { fingerprint, id: newRequestId() };
    const controller = new AbortController(); request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 12_000);
    let onAbort = () => {};
    const aborted = new Promise<never>((_, reject) => { onAbort = () => reject(new Error('Could not confirm the request. Try again with the same settings to recover it safely.')); controller.signal.addEventListener('abort', onAbort, { once: true }); });
    setBusy(true); setError(null);
    try {
      const session = await Promise.race([createAudioSession({ ...settings, requestId: intent.current!.id }, controller.signal), aborted]);
      if (!active.current || controller.signal.aborted || request.current !== controller) return;
      intent.current = null;
      onCreated(session.id);
    } catch (failure) {
      if (active.current && request.current === controller) setError(failure instanceof Error ? failure.message : 'Could not create audio session.');
    } finally {
      clearTimeout(timeout); controller.signal.removeEventListener('abort', onAbort);
      if (active.current && request.current === controller) { request.current = null; setBusy(false); }
    }
  };
  return { busy, error, generate };
}
