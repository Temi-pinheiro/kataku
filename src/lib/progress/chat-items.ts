import type { ContentItem } from '../content/types';
import type { LanguageCode } from '../matching';
import { normalize } from '../matching';

/**
 * Bridge between LLM-taught vocabulary and the deck-era progress system:
 * a digested word maps to the pack item whose target_text matches (so it
 * feeds the speakable templates and review natively); anything the packs
 * don't know gets a synthetic chat item id — still counted in mastery
 * totals and the S1 conversation whitelist.
 */

export function chatItemId(lang: LanguageCode, word: string): string {
  return `chat:${lang}:${normalize(word, lang)}`;
}

/** Pack item id when target_text matches the word/phrase, else a chat id. */
export function resolveItemId(lang: LanguageCode, word: string, packItems: readonly ContentItem[]): string {
  const wanted = normalize(word, lang);
  if (!wanted) return chatItemId(lang, word);
  const match = packItems.find((i) => normalize(i.target_text, lang) === wanted);
  return match ? match.id : chatItemId(lang, word);
}

/** True for both id forms of a language: deck ("id-f-001") and chat ("chat:id:kopi"). */
export function isItemOfLanguage(itemId: string, lang: LanguageCode): boolean {
  return itemId.startsWith(`${lang}-`) || itemId.startsWith(`chat:${lang}:`);
}

/** The speakable word for an item id (chat ids carry their own word). */
export function wordOfItem(itemId: string, packItems: readonly ContentItem[]): string | null {
  const chatPrefix = itemId.match(/^chat:[a-z]{2}:(.+)$/);
  if (chatPrefix) return chatPrefix[1];
  return packItems.find((i) => i.id === itemId)?.target_text ?? null;
}
