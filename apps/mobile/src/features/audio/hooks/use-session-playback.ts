import { useEffect, useRef, useState } from 'react';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer, type AudioStatus } from 'expo-audio';
import { resolvePronunciationUrl } from '@/features/home/data/pronunciation-url';

type PlaybackState = {
  loaded: boolean; playing: boolean; playRequested: boolean; buffering: boolean; seeking: boolean;
  position: number; duration: number; error: string | null; lockScreenWarning: string | null;
};
const initial: PlaybackState = { loaded: false, playing: false, playRequested: true, buffering: true, seeking: false, position: 0, duration: 0, error: null, lockScreenWarning: null };
let stopActiveSession: (() => void) | null = null;

/** Session playback retains the native player while paused or backgrounded. */
export function useSessionPlayback(id: number) {
  const [state, setState] = useState(initial);
  const [attempt, setAttempt] = useState(0);
  const [loop, setLoop] = useState(false);
  const [rate, setRateState] = useState(1);
  const rateRef = useRef(1);
  const loopRef = useRef(false);
  const playerRef = useRef<AudioPlayer | null>(null);
  const generation = useRef(0);
  const desiredPlayback = useRef(true);
  const seeking = useRef(false);
  const failure = useRef<(() => void) | null>(null);

  // Native tabs retain this screen. A tab blur must not dispose or restart audio.
  useEffect(() => {
    const generationRef = generation;
    const version = ++generationRef.current;
    const current = () => generation.current === version;
    let native: AudioPlayer | null = null;
    let subscription: { remove(): void } | null = null;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let started = false;
    let hasPlayed = false;
    desiredPlayback.current = true;
    seeking.current = false;
    // Reset UI when replacing the external native player or retrying playback.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(initial);
    const release = () => {
      clearTimeout(timeout);
      subscription?.remove(); subscription = null;
      const player = native; native = null;
      if (playerRef.current === player) playerRef.current = null;
      if (player) {
        try { player.pause(); } catch { /* Already interrupted or released. */ }
        try { player.setActiveForLockScreen(false); } catch { /* Not supported by this host. */ }
        try { player.remove(); } catch { /* Already released. */ }
      }
    };
    const fail = (message = 'Playback is unavailable. Check your connection and try again.') => {
      if (!current()) return;
      generation.current++;
      release();
      seeking.current = false;
      setState(previous => ({ ...previous, loaded: false, playing: false, playRequested: false, buffering: false, seeking: false,
        error: message }));
    };
    failure.current = fail;
    // Only one session may own native audio, even if two player routes remain mounted.
    stopActiveSession?.();
    const stopThisSession = () => fail('Another session is playing. Retry playback to resume this session.');
    stopActiveSession = stopThisSession;
    const waitForAudio = () => {
      if (timeout === undefined) timeout = setTimeout(fail, 20_000);
    };
    const update = (status: AudioStatus) => {
      if (!current() || !native) return;
      if (status.error) { fail(); return; }
      const buffering = !status.isLoaded || status.isBuffering;
      if (status.playing) { hasPlayed = true; desiredPlayback.current = true; }
      else if (hasPlayed && status.isLoaded && !buffering && !seeking.current) desiredPlayback.current = false;
      if (desiredPlayback.current && (buffering || !hasPlayed)) waitForAudio();
      else { clearTimeout(timeout); timeout = undefined; }
      const playRequested = desiredPlayback.current;
      setState(previous => ({ ...previous, loaded: status.isLoaded, playing: status.playing,
        playRequested,
        buffering, position: Number.isFinite(status.currentTime) ? Math.max(0, status.currentTime) : previous.position,
        duration: Number.isFinite(status.duration) && status.duration > 0 ? status.duration : previous.duration }));
      if (!started && status.isLoaded) {
        started = true;
        try {
          native.setPlaybackRate(rateRef.current);
          native.loop = loopRef.current;
          try {
            native.setActiveForLockScreen(true, { title: `VocaCycle · Session ${id}`, artist: 'VocaCycle', albumTitle: 'English ↔ Russian Pairs' },
              { showSeekForward: true, showSeekBackward: true, seekForwardIntervalSeconds: 15, seekBackwardIntervalSeconds: 15 });
          } catch {
            setState(previous => ({ ...previous, lockScreenWarning: 'Lock-screen controls are unavailable in this build.' }));
          }
          // Ignore this pre-play status snapshot; native events report actual playback.
          if (desiredPlayback.current) { waitForAudio(); native.play(); }
        } catch { fail(); }
      } else if (status.didJustFinish && !loopRef.current) {
        desiredPlayback.current = false;
        clearTimeout(timeout); timeout = undefined;
      } else if (status.playing && !buffering) {
        clearTimeout(timeout); timeout = undefined;
      }
    };
    waitForAudio();
    void (async () => {
      try {
        const uri = resolvePronunciationUrl(`/audio-sessions/${id}/audio`);
        await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' });
        if (!current()) return;
        // Preserve the existing iPhone handoff/readiness behavior for this mounted session.
        native = createAudioPlayer(null, { updateInterval: 100, keepAudioSessionActive: true });
        playerRef.current = native;
        subscription = native.addListener('playbackStatusUpdate', update);
        native.replace({ uri });
        if (native.isLoaded) update(native.currentStatus);
      } catch { fail(); }
    })();
    return () => {
      if (current()) generationRef.current++;
      failure.current = null;
      if (stopActiveSession === stopThisSession) stopActiveSession = null;
      release();
    };
  }, [id, attempt]);

  const seek = async (seconds: number) => {
    const player = playerRef.current;
    if (!player?.isLoaded || seeking.current || !Number.isFinite(seconds)) return;
    const version = generation.current;
    seeking.current = true;
    setState(previous => ({ ...previous, seeking: true }));
    try {
      const target = Math.max(0, Math.min(seconds, player.duration));
      await player.seekTo(target, 0, 0);
      if (generation.current === version) setState(previous => ({ ...previous, position: player.currentTime }));
    } catch { if (generation.current === version) failure.current?.(); }
    finally {
      if (generation.current === version) {
        seeking.current = false;
        setState(previous => ({ ...previous, seeking: false }));
      }
    }
  };
  const toggle = async () => {
    const player = playerRef.current;
    if (!player?.isLoaded || seeking.current) return;
    const version = generation.current;
    try {
      if (player.playing || (desiredPlayback.current && player.isBuffering)) {
        desiredPlayback.current = false;
        setState(previous => ({ ...previous, playRequested: false }));
        player.pause();
      } else {
        if (player.duration > 0 && player.currentTime >= player.duration - 0.1) await seek(0);
        if (generation.current !== version || playerRef.current !== player) return;
        desiredPlayback.current = true;
        setState(previous => ({ ...previous, playRequested: true }));
        player.play();
      }
    } catch { if (generation.current === version) failure.current?.(); }
  };
  const toggleLoop = () => {
    const next = !loopRef.current;
    try {
      if (playerRef.current) playerRef.current.loop = next;
      loopRef.current = next; setLoop(next);
    } catch { failure.current?.(); }
  };
  const setRate = (next: number) => {
    if (![0.75, 1, 1.25, 1.5].includes(next)) return;
    try {
      playerRef.current?.setPlaybackRate(next);
      rateRef.current = next; setRateState(next);
    } catch { failure.current?.(); }
  };
  return { ...state, loop, rate, setRate, seek, toggle, toggleLoop, retry: () => setAttempt(value => value + 1) };
}
