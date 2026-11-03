// The API exposes availability, not a generation job status. Only locally added
// words get a bounded pending window; exhausted budgets survive focus changes.
export const PRONUNCIATION_POLL_LIMIT = 90;
export type PronunciationAvailability = 'generating' | 'ready' | 'unavailable';

export function pronunciationAvailability(audioUrl: string | null | undefined, attempts?: number): PronunciationAvailability {
  if (audioUrl?.trim()) return 'ready';
  return attempts !== undefined && attempts < PRONUNCIATION_POLL_LIMIT ? 'generating' : 'unavailable';
}
