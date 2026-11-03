import { resolvePronunciationUrl } from '@/features/home/data/pronunciation-url';

export type SessionSettings = { wordIds: number[]; requestId: string };
export type AudioSession = {
  id: number; status: 'pending' | 'processing' | 'ready' | 'failed'; stage: string; error: string | null;
  audioUrl: string | null; timelineUrl: string | null; durationMs: number | null;
  examplesPerWord: number; includeWordTranslation: boolean; includeExampleTranslations: boolean;
  wordIds: number[]; words: { wordId: number; text: string; translation: string | null; ipa: string | null; position: number }[];
};
export function parseSelectedIds(value: string | string[] | undefined): number[] {
  if (typeof value !== 'string') return [];
  try {
    const ids: unknown = JSON.parse(value);
    return Array.isArray(ids) ? [...new Set(ids.filter((id): id is number => Number.isSafeInteger(id) && id > 0))] : [];
  } catch { return []; }
}
export function newRequestId(): string {
  // An idempotency key, not an authentication token; never reused for different settings.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
}
async function request(path: string, init: RequestInit): Promise<AudioSession> {
  const response = await fetch(resolvePronunciationUrl(path), { ...init, cache: 'no-store' });
  if (!response.ok) {
    let message = `Could not load audio session (HTTP ${response.status}).`;
    try { const payload = await response.json() as { error?: string }; if (payload.error) message = payload.error; } catch { /* Non-JSON error. */ }
    throw new Error(message);
  }
  const session = await response.json() as AudioSession;
  if (!Number.isSafeInteger(session.id) || !['pending', 'processing', 'ready', 'failed'].includes(session.status)) throw new Error('Invalid audio session response.');
  return session;
}
export const getAudioSession = (id: number, signal: AbortSignal) => request(`/audio-sessions/${id}`, { signal });

export type ReadySessionOption = { id: number; wordCount: number | null; durationMs: number | null };
export async function getReadyAudioSessions(signal: AbortSignal): Promise<ReadySessionOption[]> {
  const response = await fetch(resolvePronunciationUrl('/audio-sessions'), { signal, cache: 'no-store' });
  if (response.status === 404 || response.status === 405)
    throw new Error('Session listing is not available from this API yet. Your current session is shown below.');
  if (!response.ok) throw new Error(`Could not load sessions (HTTP ${response.status}).`);
  const sessions: unknown = await response.json();
  if (!Array.isArray(sessions)) throw new Error('The session list response is invalid.');
  return sessions.filter(session => session?.status === 'ready' && Number.isSafeInteger(session.id) && session.id > 0)
    .map(session => ({ id: session.id,
      wordCount: Array.isArray(session.words) ? session.words.length : Array.isArray(session.wordIds) ? session.wordIds.length
        : Number.isSafeInteger(session.wordCount) && session.wordCount >= 0 ? session.wordCount : null,
      durationMs: Number.isFinite(session.durationMs) && session.durationMs > 0 ? session.durationMs : null }));
}
export const createAudioSession = (settings: SessionSettings, signal: AbortSignal) => request('/audio-sessions', {
  method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings),
});

export type AudioTimelineEntry = {
  wordId: number; wordPosition: number; kind: string; text: string;
  language: 'en' | 'ru'; startMs: number; endMs: number;
};

export async function getAudioTimeline(id: number, signal: AbortSignal): Promise<AudioTimelineEntry[]> {
  const response = await fetch(resolvePronunciationUrl(`/audio-sessions/${id}/timeline`), { signal, cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not load the audio timeline (HTTP ${response.status}).`);
  const entries: unknown = await response.json();
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > 1000)
    throw new Error('The audio timeline is unavailable.');
  let previousEnd = 0;
  for (const entry of entries) {
    if (!entry || !Number.isSafeInteger(entry.wordId) || entry.wordId <= 0
      || !Number.isSafeInteger(entry.wordPosition) || entry.wordPosition < 0
      || typeof entry.kind !== 'string' || typeof entry.text !== 'string'
      || !['en', 'ru'].includes(entry.language)
      || !Number.isSafeInteger(entry.startMs) || !Number.isSafeInteger(entry.endMs)
      || entry.startMs < previousEnd || entry.endMs <= entry.startMs)
      throw new Error('The audio timeline is invalid.');
    previousEnd = entry.endMs;
  }
  return entries as AudioTimelineEntry[];
}
