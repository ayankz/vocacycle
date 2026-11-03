import type { WordDto } from '@/features/home/data/words-api';

export type VocabularyFilter = 'all' | 'recent' | 'not-in-audio';

export function filterVocabulary(words: readonly WordDto[], query: string, filter: VocabularyFilter): WordDto[] {
  const term = query.trim().toLocaleLowerCase();
  const matches = words.filter(word =>
    (filter !== 'not-in-audio' || word.hasAudioSession === false) &&
    (!term || word.text.toLocaleLowerCase().includes(term) || word.translation?.toLocaleLowerCase().includes(term)));
  if (filter === 'recent') {
    // Unknown historical dates stay unknown; ID order is only a legacy fallback.
    const timestamp = (word: WordDto) => {
      const value = word.createdAt ? Date.parse(word.createdAt) : NaN;
      return Number.isFinite(value) ? value : -Infinity;
    };
    matches.sort((a, b) => {
      const left = timestamp(a), right = timestamp(b);
      return left === right ? b.id - a.id : left > right ? -1 : 1;
    });
  }
  return matches;
}
