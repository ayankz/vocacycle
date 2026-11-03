const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./helpers/load-ts.cjs');
function setup() {
  const values = new Map();
  const storage = { async getItem(key) { return values.get(key) ?? null; }, async setItem(key, value) { values.set(key, value); }, async removeItem(key) { values.delete(key); } };
  const { deletionStore } = createLoader({ 'expo-sqlite/kv-store': { __esModule: true, default: storage } })('src/features/home/data/deletion-store.ts');
  return { store: deletionStore, values };
}

test('the SQLite journal retains snapshot/deadline and is scoped to the configured API', async () => {
  const s = setup(); const value = { word: { id: 27, text: 'bike', pronunciationAudioUrl: '/words/27/pronunciation' }, undoUntil: 5000 };
  assert.equal(await s.store.read(), null); await s.store.write(value);
  const key = [...s.values.keys()][0]; assert.match(key, /http:\/\/192\.168\.1\.10:5126$/);
  const restored = await s.store.read(); assert.equal(restored.word.id, 27); assert.equal(restored.undoUntil, 5000);
  assert.equal(restored.word.pronunciationAudioUrl, '/words/27/pronunciation');
  await s.store.write(null); assert.equal(await s.store.read(), null);
});

test('corrupt deletion journals are rejected rather than sending an unsafe ID to DELETE', async () => {
  for (const value of ['not-json', JSON.stringify({ word: { id: -1, text: 'bike' }, undoUntil: 5000 }), JSON.stringify({ word: { id: 27, text: 'bike' }, undoUntil: null })]) {
    const s = setup(); await s.store.write({ word: { id: 27, text: 'bike' }, undoUntil: 5000 });
    s.values.set([...s.values.keys()][0], value);
    await assert.rejects(s.store.read());
  }
});
