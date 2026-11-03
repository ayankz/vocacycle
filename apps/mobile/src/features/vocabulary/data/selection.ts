import type { WordDto } from '@/features/home/data/words-api';

export function validSelection(ids: Iterable<number>, words: readonly WordDto[]): number[] {
  const active = new Set(words.map(word => word.id));
  return [...new Set(ids)].filter(id => Number.isSafeInteger(id) && id > 0 && active.has(id));
}

export function toggleSelection(ids: ReadonlySet<number>, id: number): Set<number> {
  const next = new Set(ids);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function selectAll(ids: ReadonlySet<number>, words: readonly WordDto[]): Set<number> {
  const next = new Set(ids);
  const all = words.length > 0 && words.every(word => next.has(word.id));
  for (const word of words) {
    if (all) next.delete(word.id);
    else next.add(word.id);
  }
  return next;
}
