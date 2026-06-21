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

/**
 * Line roles (owner typography spec, 2026-06-12; module marker added
 * 2026-06-21): the teacher prefixes its verdict line with +/~/- (how the
 * attempt went) and its closing "now say" cue line with >. When it finishes
 * a module it ends with a "= " line whose text is a one-line recap of what
 * the learner just earned — the app shows that recap above a Continue button
 * instead of waiting for the learner to type. The app strips the symbols and
 * styles by role — verdicts get semibold + result color, cues get the
 * second-largest size. Untagged lines (and whole pre-spec transcripts) render
 * plain, unchanged.
 */
export type TeacherGrade = 'good' | 'close' | 'miss';

export type TeacherLine =
  | { kind: 'verdict'; grade: TeacherGrade; text: string }
  | { kind: 'cue'; text: string }
  | { kind: 'complete'; recap: string }
  | { kind: 'plain'; text: string };

const GRADE_BY_MARK: Record<string, TeacherGrade> = {
  '+': 'good',
  '~': 'close',
  '-': 'miss',
  '–': 'miss',
};

export function teacherLines(text: string): TeacherLine[] {
  const lines: TeacherLine[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const verdict = line.match(/^([+~\-–])\s+(.+)$/);
    if (verdict && GRADE_BY_MARK[verdict[1]]) {
      lines.push({ kind: 'verdict', grade: GRADE_BY_MARK[verdict[1]], text: verdict[2] });
      continue;
    }
    const cue = line.match(/^>\s+(.+)$/);
    if (cue) {
      lines.push({ kind: 'cue', text: cue[1] });
      continue;
    }
    const complete = line.match(/^=\s+(.+)$/);
    if (complete) {
      lines.push({ kind: 'complete', recap: complete[1] });
      continue;
    }
    lines.push({ kind: 'plain', text: line });
  }
  return lines;
}

/**
 * The module-complete recap, if this teacher turn signalled the section is
 * done (a "= " line), else null. Drives the Recap + Continue affordance.
 */
export function moduleComplete(text: string): string | null {
  const line = teacherLines(text).find((l) => l.kind === 'complete');
  return line && line.kind === 'complete' ? line.recap : null;
}
