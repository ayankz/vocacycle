import { useCallback, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getAudioSession } from '../data/audio-sessions-api';
import { SessionStatusController, type SessionStatusState } from '../data/session-status-controller';

export function useSessionStatus(id: number) {
  const [state, setState] = useState<SessionStatusState>({ session: null, loading: true, error: null, paused: false });
  const [controller] = useState(() => new SessionStatusController(id, getAudioSession, setState));
  useFocusEffect(useCallback(() => {
    if (AppState.currentState === 'active') controller.focus();
    const subscription = AppState.addEventListener('change', status => { if (status === 'active') controller.focus(); else controller.blur(); });
    return () => { subscription.remove(); controller.blur(); };
  }, [controller]));
  return { ...state, refresh: controller.refresh };
}
