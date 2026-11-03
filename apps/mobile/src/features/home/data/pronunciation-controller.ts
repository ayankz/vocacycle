import type { AudioPlayer, AudioStatus } from 'expo-audio';

import { resolvePronunciationUrl } from './pronunciation-url';

export type PronunciationState = { wordId: string | null; phase: 'idle' | 'loading' | 'playing' };
type WordAudio = { id: string; pronunciationAudioUrl?: string | null };
type Player = Pick<AudioPlayer, 'play' | 'pause' | 'replace' | 'remove' | 'addListener' | 'isLoaded'>;

/** Owns at most one native player. A fresh instance also isolates late source events. */
export class PronunciationController {
  private state: PronunciationState = { wordId: null, phase: 'idle' };
  private request = 0;
  private player: Player | null = null;
  private subscription: { remove(): void } | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private createPlayer: () => Player,
    private prepareAudio: () => Promise<void>,
    private notify: (state: PronunciationState) => void,
    private onError: () => void,
  ) {}

  play = async (word: WordAudio) => {
    this.stop();
    const request = this.request;
    const current = () => request === this.request;
    const fail = () => {
      if (!current()) return;
      this.stop();
      this.onError();
    };
    this.setState({ wordId: word.id, phase: 'loading' });
    const waitForPlayback = () => {
      if (this.timeout === null) this.timeout = setTimeout(fail, 10_000);
    };
    waitForPlayback();
    try {
      const uri = resolvePronunciationUrl(word.pronunciationAudioUrl);
      await this.prepareAudio();
      if (!current()) return;
      const player = this.createPlayer();
      this.player = player;
      let playRequested = false;
      let started = false;
      const startWhenReady = () => {
        if (!current() || playRequested || !player.isLoaded) return;
        // Set before calling native code: play() can itself emit a status event.
        playRequested = true;
        try { player.play(); } catch { fail(); }
      };
      this.subscription = player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
        if (!current()) return;
        if (status.error) { fail(); return; }
        if (status.didJustFinish) { this.stop(); return; }
        if (!playRequested) {
          if (status.isLoaded) startWhenReady();
          // This snapshot predates play(), so it cannot describe a playback pause.
          return;
        }
        if (status.playing && !status.isBuffering) {
          started = true;
          this.clearTimeout();
          this.setState({ wordId: word.id, phase: 'playing' });
        } else if (started && !status.playing && !status.isBuffering) {
          // Headphone disconnection or an OS interruption must not restart playback.
          this.stop();
        } else {
          this.setState({ wordId: word.id, phase: 'loading' });
          waitForPlayback();
        }
      });
      player.replace({ uri });
      // Cached sources can be ready before an asynchronous status event arrives.
      startWhenReady();
    } catch { fail(); }
  };

  stopWord = (id: string) => { if (this.state.wordId === id) this.stop(); };

  stop = () => {
    this.request++;
    this.clearTimeout();
    this.subscription?.remove();
    this.subscription = null;
    const player = this.player;
    this.player = null;
    if (player) {
      try { player.pause(); } catch { /* A native interruption may already have stopped it. */ }
      try { player.remove(); } catch { /* The native player may already have been released. */ }
    }
    this.setState({ wordId: null, phase: 'idle' });
  };

  private clearTimeout() {
    if (this.timeout !== null) clearTimeout(this.timeout);
    this.timeout = null;
  }

  private setState(state: PronunciationState) {
    if (state.wordId === this.state.wordId && state.phase === this.state.phase) return;
    this.state = state;
    this.notify(state);
  }
}
