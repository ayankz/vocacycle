import type { AudioSession } from './audio-sessions-api';

export type SessionStatusState = { session: AudioSession | null; loading: boolean; error: string | null; paused: boolean };
export class SessionStatusController {
  private active = false;
  private version = 0;
  private deadline = 0;
  private request: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private state: SessionStatusState = { session: null, loading: true, error: null, paused: false };
  constructor(private id: number, private load: (id: number, signal: AbortSignal) => Promise<AudioSession>, private notify: (state: SessionStatusState) => void) {}
  focus = () => { this.active = true; this.deadline = Date.now() + 30 * 60_000; void this.refresh(); };
  blur = () => { this.active = false; this.version++; clearTimeout(this.timer); this.request?.abort(); this.request = null; };
  refresh = async () => {
    if (!this.active || this.request) return;
    clearTimeout(this.timer);
    const version = ++this.version;
    const request = new AbortController(); this.request = request;
    const timeout = setTimeout(() => request.abort(), 10_000);
    let onAbort = () => {};
    const aborted = new Promise<never>((_, reject) => { onAbort = () => reject(new Error('Could not check generation status. Try again.')); request.signal.addEventListener('abort', onAbort, { once: true }); });
    this.state = { ...this.state, loading: !this.state.session, error: null, paused: false }; this.notify(this.state);
    try {
      const session = await Promise.race([this.load(this.id, request.signal), aborted]);
      if (!this.active || version !== this.version || request.signal.aborted) return;
      if (session.id !== this.id) throw new Error('Unexpected audio session response.');
      this.state = { session, loading: false, error: null, paused: false };
      if (session.status === 'pending' || session.status === 'processing') {
        if (Date.now() >= this.deadline) this.state.paused = true;
        else this.timer = setTimeout(() => { void this.refresh(); }, 3000);
      }
    } catch (error) {
      if (!this.active || version !== this.version) return;
      this.state = { ...this.state, loading: false, error: error instanceof Error ? error.message : 'Could not check generation status.', paused: true };
    } finally {
      clearTimeout(timeout); request.signal.removeEventListener('abort', onAbort);
      if (this.active && version === this.version) { this.request = null; this.notify(this.state); }
    }
  };
}
