export type WordDto = { id: number; text: string; translation: string | null };

const baseUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');

function url(path: string) {
  if (!baseUrl) throw new Error('API URL missing. Set EXPO_PUBLIC_API_URL and restart Expo.');
  return `${baseUrl}${path}`;
}

async function errorMessage(response: Response) {
  try {
    const payload = await response.json() as { error?: string };
    if (payload.error) return payload.error;
  } catch { /* Use a status message for non-JSON responses. */ }
  return response.status === 409 ? 'This word has already been saved.' : `Could not save word (HTTP ${response.status}). Please try again.`;
}

export async function getWords(): Promise<WordDto[]> {
  const response = await fetch(url('/words'));
  if (!response.ok) throw new Error(await errorMessage(response));
  return response.json() as Promise<WordDto[]>;
}

export async function createWord(text: string): Promise<WordDto> {
  const response = await fetch(url('/words'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  return response.json() as Promise<WordDto>;
}
