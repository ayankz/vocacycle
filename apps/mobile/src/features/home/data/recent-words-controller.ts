import { PRONUNCIATION_POLL_LIMIT } from './pronunciation-status';
import type { WordDto } from './words-api';

export type RecentWordsState = {
  words: WordDto[];
  loading: boolean;
  hasLoaded?: boolean;
  refreshing: boolean;
  error: string | null;
  attempts: ReadonlyMap<number, number>;
  pronunciationAttempts: ReadonlyMap<number, number>;
};

// One request and one timer for the whole list; attempt budgets belong to words.
export class RecentWordsController {
  private state: RecentWordsState = { words: [], loading: true, hasLoaded: false, refreshing: false, error: null, attempts: new Map(), pronunciationAttempts: new Map() };
  private active = false;
  private generation = 0;
  private refreshRequested = false;
  private request: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private removedIds = new Set<number>();
  private additions = new Map<number, WordDto>();

  constructor(
    private load: (signal: AbortSignal) => Promise<WordDto[]>,
    private notify: (state: RecentWordsState) => void,
  ) {}

  private publish() { if (this.active) this.notify({ ...this.state, attempts: new Map(this.state.attempts), pronunciationAttempts: new Map(this.state.pronunciationAttempts) }); }

  focus = () => {
    this.active = true;
    this.publish();
    this.refreshRequested = true;
    void this.refresh();
  };

  blur = () => {
    this.active = false;
    this.state.refreshing = false;
    this.generation++;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.request?.abort();
  };

  // A pull during an existing GET queues one fresh GET after it, rather than
  // treating a response requested before the gesture as the manual refresh.
  refreshManually = () => {
    if (!this.active || this.state.refreshing) return;
    this.state.refreshing = true;
    this.publish();
    this.refreshRequested = true;
    void this.refresh();
  };

  removed = (id: number) => {
    this.removedIds.add(id);
    this.additions.delete(id);
    this.state.words = this.state.words.filter(word => word.id !== id);
    this.state.attempts = new Map([...this.state.attempts].filter(([wordId]) => wordId !== id));
    this.state.pronunciationAttempts = new Map([...this.state.pronunciationAttempts].filter(([wordId]) => wordId !== id));
    this.publish();
  };

  restored = (word: WordDto) => {
    if (!this.state.words.some(existing => existing.id === word.id)) {
      this.state.words = [word, ...this.state.words].sort((a, b) => b.id - a.id);
      this.publish();
    }
  };

  added = (word: WordDto) => {
    this.additions.set(word.id, word);
    if (!word.pronunciationAudioUrl?.trim()) this.state.pronunciationAttempts = new Map(this.state.pronunciationAttempts).set(word.id, 0);
    if (!word.translation || !word.ipa) this.state.attempts = new Map(this.state.attempts).set(word.id, 0);
    this.state.words = [word, ...this.state.words.filter(existing => existing.id !== word.id)]
      .sort((a, b) => b.id - a.id);
    this.state.loading = false;
    this.publish();
    this.refreshRequested = true;
    void this.refresh();
  };

  private waiting() {
    return [...this.state.attempts].filter(([, attempts]) => attempts < 5).map(([id]) => id);
  }

  private waitingForPronunciation() {
    return [...this.state.pronunciationAttempts].filter(([, attempts]) => attempts < PRONUNCIATION_POLL_LIMIT).map(([id]) => id);
  }

  private schedule() {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.active || this.request || (this.waiting().length === 0 && this.waitingForPronunciation().length === 0)) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.refresh(true);
    }, 2000);
  }

  private async refresh(poll = false) {
    if (!this.active || this.request) return;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.refreshRequested = false;
    const generation = this.generation;
    const manual = this.state.refreshing;
    const controller = new AbortController();
    this.request = controller;
    const polledIds = poll ? this.waiting() : [];
    const pronunciationIds = poll ? this.waitingForPronunciation() : [];
    // A stalled network must also end a polling attempt.
    const timeout = setTimeout(() => controller.abort(), 8000);
    let onAbort: () => void = () => {};
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(new Error('Saved words request cancelled.'));
      controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      // Cancellation must release the request slot even if the transport never
      // settles. Any late transport result is ignored by this race.
      const words = await Promise.race([this.load(controller.signal), aborted]);
      if (controller.signal.aborted || !this.active || generation !== this.generation) return;
      const merged = new Map(words.map(word => [word.id, word]));
      for (const [id, word] of this.additions) {
        if (merged.has(id)) this.additions.delete(id);
        else merged.set(id, word); // A GET started before Add must not hide the new word.
      }
      this.state.words = [...merged.values()].filter(word => !this.removedIds.has(word.id)).sort((a, b) => b.id - a.id);
      const attempts = new Map(this.state.attempts);
      for (const word of words) if (word.translation && word.ipa) attempts.delete(word.id);
      this.state.attempts = attempts;
      const pronunciationAttempts = new Map(this.state.pronunciationAttempts);
      for (const word of words) if (word.pronunciationAudioUrl?.trim()) pronunciationAttempts.delete(word.id);
      this.state.pronunciationAttempts = pronunciationAttempts;
      this.state.error = null;
      this.state.hasLoaded = true;
    } catch (error) {
      if (this.active && generation === this.generation) {
        this.state.error = controller.signal.aborted
          ? 'Could not refresh saved words. Please try again later.'
          : error instanceof Error ? error.message : 'Could not load saved words.';
      }
    } finally {
      clearTimeout(timeout);
      controller.signal.removeEventListener('abort', onAbort);
      this.request = null;
      if (this.active && generation === this.generation) {
        const attempts = new Map(this.state.attempts);
        for (const id of polledIds) {
          if (attempts.has(id)) attempts.set(id, attempts.get(id)! + 1);
        }
        this.state.attempts = attempts;
        const pronunciationAttempts = new Map(this.state.pronunciationAttempts);
        for (const id of pronunciationIds) {
          if (pronunciationAttempts.has(id)) pronunciationAttempts.set(id, pronunciationAttempts.get(id)! + 1);
        }
        this.state.pronunciationAttempts = pronunciationAttempts;
        this.state.loading = false;
        if (manual) this.state.refreshing = false;
        this.publish();
        if (this.refreshRequested) void this.refresh();
        else this.schedule();
      } else if (this.active && this.refreshRequested) {
        void this.refresh();
      }
    }
  }
}
