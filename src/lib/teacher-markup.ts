/**
 * Teacher markup: the LLM wraps every target-language word/phrase in
 * «guillemets». One convention, two consumers — the chat renders target
 * segments as the focal content (English sits quietly on the background),
 * and the play button speaks ONLY the target segments, so TTS stays locked
 * to one language (owner: no English audio, no accent switching, ever).
 */

export interface MarkSegment {
  target: boolean;
  text: string;
}

/** Split marked text into ordered segments; marks are stripped. Unclosed « runs to the end. */
export function parseMarked(text: string): MarkSegment[] {
  const segments: MarkSegment[] = [];
  let rest = text;
  while (rest.length > 0) {
    const open = rest.indexOf('«');
    if (open === -1) {
      segments.push({ target: false, text: rest });
      break;
    }
    if (open > 0) segments.push({ target: false, text: rest.slice(0, open) });
    const close = rest.indexOf('»', open + 1);
    if (close === -1) {
      segments.push({ target: true, text: rest.slice(open + 1) });
      break;
    }
    segments.push({ target: true, text: rest.slice(open + 1, close) });
    rest = rest.slice(close + 1);
  }
  return segments.map((s) => ({ ...s, text: s.text })).filter((s) => s.text.trim().length > 0);
}

/** The speakable text: target segments only, separated by sentence beats. */
export function targetOnly(text: string): string {
  return parseMarked(text)
    .filter((s) => s.target)
    .map((s) => {
      const t = s.text.trim();
      return /[.!?…]$/.test(t) ? t : `${t}.`;
    })
    .join('\n');
}

/** Plain text with the marks removed (for surfaces that don't style segments). */
export function stripMarks(text: string): string {
  return text.replace(/[«»]/g, '');
}
