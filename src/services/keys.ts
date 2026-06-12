import * as SecureStore from 'expo-secure-store';

/** API keys live in the device keychain only (plan §4.3) — never in code or db. */

const NAMES = {
  openai: 'openai_api_key',
  anthropic: 'anthropic_api_key',
  elevenlabs: 'elevenlabs_api_key',
  elevenlabsVoice: 'elevenlabs_voice_id',
} as const;

type KeyName = keyof typeof NAMES;

const cache = new Map<KeyName, string | null>();

async function getKey(name: KeyName): Promise<string | null> {
  if (cache.has(name)) return cache.get(name)!;
  let value: string | null = null;
  try {
    value = await SecureStore.getItemAsync(NAMES[name]);
  } catch {
    value = null;
  }
  cache.set(name, value);
  return value;
}

async function setKey(name: KeyName, value: string): Promise<void> {
  const trimmed = value.trim() || null;
  cache.set(name, trimmed);
  if (trimmed) await SecureStore.setItemAsync(NAMES[name], trimmed);
  else await SecureStore.deleteItemAsync(NAMES[name]);
}

export const getOpenAIKey = () => getKey('openai');
export const setOpenAIKey = (v: string) => setKey('openai', v);
export const getAnthropicKey = () => getKey('anthropic');
export const setAnthropicKey = (v: string) => setKey('anthropic', v);
export const getElevenLabsKey = () => getKey('elevenlabs');
export const setElevenLabsKey = (v: string) => setKey('elevenlabs', v);
export const getElevenLabsVoice = () => getKey('elevenlabsVoice');
export const setElevenLabsVoice = (v: string) => setKey('elevenlabsVoice', v);
