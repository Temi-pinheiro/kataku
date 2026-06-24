import { getSetting, setSetting } from '../db';

/**
 * A stable, pseudonymous device id for the (opt-in, Phase C) shared verb cache.
 * Sent as the `x-user-id` header — NOT a login, NOT PII. Generated once, stored
 * in the settings table, reused forever. Only ever transmitted when the remote
 * cache is enabled (a base URL is configured); with remote off it never leaves
 * the device. Soft identity, so a non-crypto fallback id is acceptable.
 */

const KEY = 'device_user_id';

let cached: string | null = null;

function uuidV4(): string {
  const bytes = new Uint8Array(16);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => void } }).crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex
    .slice(8, 10)
    .join('')}-${hex.slice(10, 16).join('')}`;
}

export async function getDeviceUserId(): Promise<string> {
  if (cached) return cached;
  let id = await getSetting(KEY, '');
  if (!id) {
    id = uuidV4();
    await setSetting(KEY, id);
  }
  cached = id;
  return id;
}
