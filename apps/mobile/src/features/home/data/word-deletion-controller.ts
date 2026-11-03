import type { WordDto } from './words-api';

export const WORD_UNDO_MS = 5000;
export type PendingWordDeletion = { word: WordDto; undoUntil: number };
export type DeletionStore = {
  read(): Promise<PendingWordDeletion | null>;
  write(value: PendingWordDeletion | null): Promise<void>;
};
export type WordDeletionState = { pending: PendingWordDeletion | null; ready: boolean; busy: boolean; undoAvailable: boolean; error: string | null };

// One durable operation at a time guarantees each removal its full Undo window.
// Timers are only a foreground convenience; persisted wall-clock deadlines decide.
export class WordDeletionController {
  private pending: PendingWordDeletion | null = null;
  private ready = false;
  private busy = false;
  private active = false;
  private error: string | null = null;
  private reconcileRequested = false;
  private initialized: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private request: AbortController | null = null;

  constructor(
    private store: DeletionStore,
    private remove: (id: number, signal: AbortSignal) => Promise<void>,
    private notify: (state: WordDeletionState) => void,
    private removed: (id: number) => void,
    private restored: (word: WordDto) => void,
    private now = Date.now,
  ) {}

  private publish() {
    if (this.active) this.notify({ pending: this.pending, ready: this.ready, busy: this.busy,
      undoAvailable: !!this.pending && this.now() < this.pending.undoUntil && !this.busy, error: this.error });
  }

  start = () => {
    this.active = true;
    this.initialized ??= this.store.read().then(value => { this.pending = value; this.ready = true; });
    void this.initialized.then(() => {
      if (this.request) this.reconcileRequested = true;
      this.publish(); this.schedule();
    }).catch(() => {
      this.initialized = null;
      this.error = 'Could not load pending removal. Return to Home to try again.';
      this.publish();
    });
  };

  stop = () => {
    this.active = false;
    clearTimeout(this.timer);
    this.request?.abort();
  };

  delete = async (word: WordDto) => {
    if (!this.active || !this.ready || this.pending || this.busy) return false;
    this.busy = true; this.error = null; this.publish();
    try {
      const pending = { word, undoUntil: this.now() + WORD_UNDO_MS };
      await this.store.write(pending); // Persist BEFORE the UI hides anything.
      this.pending = pending;
      return true;
    } catch {
      this.error = 'Could not save removal. The word has not been removed.';
      return false;
    } finally {
      this.busy = false; this.publish(); this.schedule();
    }
  };

  undo = async () => {
    if (!this.active || !this.pending || this.busy || this.now() >= this.pending.undoUntil) return;
    const word = this.pending.word;
    this.busy = true; this.publish();
    try {
      await this.store.write(null); // A crash after this cannot later delete an undone word.
      this.pending = null; this.error = null;
      this.restored(word);
    } catch { this.error = 'Could not undo removal. Please try again before Undo expires.'; }
    finally { this.busy = false; this.publish(); this.schedule(); }
  };

  private schedule() {
    clearTimeout(this.timer);
    if (!this.active || !this.pending || this.busy) return;
    const delay = this.pending.undoUntil - this.now();
    if (delay <= 0) void this.retry();
    else this.timer = setTimeout(() => void this.retry(), delay);
  }

  retry = async () => {
    if (!this.active) return;
    if (!this.pending) {
      if (this.ready && this.error) { this.error = null; this.publish(); }
      return;
    }
    if (this.busy || this.now() < this.pending.undoUntil) return;
    const pending = this.pending;
    const controller = new AbortController();
    this.reconcileRequested = false;
    this.request = controller; this.busy = true; this.publish();
    let onAbort: () => void = () => {};
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(new Error('Removal interrupted.'));
      controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      await Promise.race([this.remove(pending.word.id, controller.signal), aborted]);
      await this.store.write(null);
      this.pending = null; this.error = null;
      this.removed(pending.word.id);
    } catch (error) {
      // Only restore on a confirmed rejection. Lost DELETE responses are
      // ambiguous; retain the journal and retry the idempotent endpoint later.
      if (!controller.signal.aborted && error instanceof Error && 'confirmedKept' in error && error.confirmedKept) {
        try {
          await this.store.write(null);
          this.pending = null;
          this.restored(pending.word);
          this.error = 'Could not remove word. It has been restored. Pull down to refresh or try again.';
        } catch { this.error = 'Could not finalize removal. Return to Home to check again.'; }
      } else this.error = 'Could not confirm removal. Pull down to refresh or return to Home to check again.';
    } finally {
      clearTimeout(timeout);
      controller.signal.removeEventListener('abort', onAbort);
      this.request = null; this.busy = false; this.publish();
      if (this.active && this.reconcileRequested) void this.retry();
    }
  };
}
