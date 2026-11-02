/** Only play audio served by the configured backend, including LAN HTTP in development. */
export function resolvePronunciationUrl(reference: string | null | undefined, apiUrl = process.env.EXPO_PUBLIC_API_URL): string {
  if (!reference?.trim() || !apiUrl?.trim()) throw new Error('Pronunciation audio is unavailable.');
  const base = new URL(apiUrl.trim());
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
    throw new Error('Invalid API URL.');
  }
  const audio = new URL(reference.trim(), `${base.href.replace(/\/+$/, '')}/`);
  if (audio.origin !== base.origin || audio.username || audio.password || audio.hash) {
    throw new Error('Invalid pronunciation URL.');
  }
  return audio.href;
}
