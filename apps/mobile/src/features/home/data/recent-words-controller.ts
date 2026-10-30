import type { WordDto } from './words-api';

export type RecentWordsState = {
  words: WordDto[];
  loading: boolean;
  error: string | null;
  attempts: ReadonlyMap<number, number>;
};

// One request and one timer for the whole list; attempt budgets belong to words.
export class RecentWordsController {
  private state: RecentWordsState = { words: [], loading: true, error: null, attempts: new Map() };
  private active = false;
  private generation = 0;
  private refreshRequested = false;
  private request: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private additions = new Map<number, WordDto>();

  constructor(
    private load: (signal: AbortSignal) => Promise<WordDto[]>,
    private notify: (state: RecentWordsState) => void,
  ) {}

  private publish() { this.notify({ ...this.state, attempts: new Map(this.state.attempts) }); }

  focus = () => {
    this.active = true;
    this.refreshRequested = true;
    void this.refresh();
  };

  blur = () => {
    this.active = false;
    this.generation++;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.request?.abort();
  };

  added = (word: WordDto) => {
    this.additions.set(word.id, word);
    if (!word.translation) this.state.attempts = new Map(this.state.attempts).set(word.id, 0);
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

  private schedule() {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.active || this.request || this.waiting().length === 0) return;
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
    const controller = new AbortController();
    this.request = controller;
    const polledIds = poll ? this.waiting() : [];
    // A stalled network must also end a polling attempt.
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const words = await this.load(controller.signal);
      if (controller.signal.aborted || !this.active) return;
      const merged = new Map(words.map(word => [word.id, word]));
      for (const [id, word] of this.additions) {
        if (merged.has(id)) this.additions.delete(id);
        else merged.set(id, word); // A GET started before Add must not hide the new word.
      }
      this.state.words = [...merged.values()].sort((a, b) => b.id - a.id);
      const attempts = new Map(this.state.attempts);
      for (const word of words) if (word.translation) attempts.delete(word.id);
      this.state.attempts = attempts;
      this.state.error = null;
    } catch (error) {
      if (this.active && generation === this.generation) {
        this.state.error = controller.signal.aborted
          ? 'Could not refresh saved words. Please try again later.'
          : error instanceof Error ? error.message : 'Could not load saved words.';
      }
    } finally {
      clearTimeout(timeout);
      this.request = null;
      if (this.active) {
        const attempts = new Map(this.state.attempts);
        for (const id of generation === this.generation ? polledIds : []) {
          if (attempts.has(id)) attempts.set(id, attempts.get(id)! + 1);
        }
        this.state.attempts = attempts;
        this.state.loading = false;
        this.publish();
        if (this.refreshRequested) void this.refresh();
        else this.schedule();
      }
    }
  }
}
