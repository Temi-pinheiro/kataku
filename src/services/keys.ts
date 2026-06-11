import * as SecureStore from 'expo-secure-store';

/** API keys live in the device keychain only (plan §4.3) — never in code or db. */
const OPENAI_KEY = 'openai_api_key';

let cached: string | null | undefined;

export async function getOpenAIKey(): Promise<string | null> {
  if (cached !== undefined) return cached;
  try {
    cached = await SecureStore.getItemAsync(OPENAI_KEY);
  } catch {
    cached = null;
  }
  return cached;
}

export async function setOpenAIKey(value: string): Promise<void> {
  cached = value.trim() || null;
  if (cached) await SecureStore.setItemAsync(OPENAI_KEY, cached);
  else await SecureStore.deleteItemAsync(OPENAI_KEY);
}
