import type { VerbEntry } from '../lib/verbs/types';
import { getDeviceUserId } from './device-id';

/**
 * Phase C (designed, ships INERT): a shared cloud cache so the first device to
 * view a verb pays once and every other device/install gets it free. Soft-auth
 * is a single `x-user-id` header (the pseudonymous device id) — no login, like
 * the owner's "suara" project.
 *
 * Disabled until EXPO_PUBLIC_VERB_CACHE_BASE_URL is set: both calls no-op, so
 * the local + bundled caches and on-device generation are the whole story today
 * and the app stays fully local-first. Provisioning the backend + setting the
 * URL is an owner task (docs/OWNER-TODO.md). The lookup chain in
 * services/verbs.ts already calls these, so enabling remote is config-only.
 *
 * Backend contract:
 *   GET  /v1/verbs/{lang}/{lemma}  -> 200 {VerbEntry} | 404   (header: x-user-id)
 *   POST /v1/verbs/{lang}/{lemma}  body {VerbEntry} -> 204     (write-back after generate)
 * Server keys on (lang, lemma); the page is deterministic so duplicates are
 * idempotent. The cache is a pure accelerator — the app works with it absent.
 */

const BASE_URL = (process.env.EXPO_PUBLIC_VERB_CACHE_BASE_URL ?? '').trim().replace(/\/+$/, '');

export function remoteCacheEnabled(): boolean {
  return BASE_URL.length > 0;
}

function endpoint(language: string, lemma: string): string {
  return `${BASE_URL}/v1/verbs/${encodeURIComponent(language)}/${encodeURIComponent(lemma)}`;
}

/** Shared-cache lookup; null on miss/disabled/error (must never break the page). */
export async function getRemoteVerb(language: string, lemma: string): Promise<VerbEntry | null> {
  if (!BASE_URL) return null;
  try {
    const res = await fetch(endpoint(language, lemma), { headers: { 'x-user-id': await getDeviceUserId() } });
    if (!res.ok) return null;
    return (await res.json()) as VerbEntry;
  } catch {
    return null;
  }
}

/** Best-effort write-back so the next device gets this verb free; ignores failures. */
export async function putRemoteVerb(language: string, lemma: string, entry: VerbEntry): Promise<void> {
  if (!BASE_URL) return;
  try {
    await fetch(endpoint(language, lemma), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': await getDeviceUserId() },
      body: JSON.stringify(entry),
    });
  } catch {
    // write-back is optional; a failed push just means the next device regenerates
  }
}
