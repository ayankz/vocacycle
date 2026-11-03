import Storage from 'expo-sqlite/kv-store';
import type { DeletionStore, PendingWordDeletion } from './word-deletion-controller';

// Bind the journal to its backend, so changing a LAN origin cannot delete IDs on
// another server. No credentials or provider configuration are persisted here.
const key = `vocacycle.pending-word-deletion.v1:${process.env.EXPO_PUBLIC_API_URL ?? ''}`;
export const deletionStore: DeletionStore = {
  async read() {
    const json = await Storage.getItem(key);
    if (!json) return null;
    const value = JSON.parse(json) as PendingWordDeletion;
    if (!Number.isSafeInteger(value.word?.id) || value.word.id <= 0 || typeof value.word.text !== 'string'
      || !Number.isFinite(value.undoUntil)) throw new Error('Invalid pending deletion journal.');
    return value;
  },
  async write(value) {
    if (value) await Storage.setItem(key, JSON.stringify(value));
    else await Storage.removeItem(key);
  },
};
