# Kataku design principles

Written after the owner judged the v1 UI "so simple it broke the app."
Simple was never the problem — *dead* was. These rules are the contract for
any UI work; patterns are borrowed from voice assistants (state model),
Duolingo (session anatomy, feedback sheet), Pimsleur (audio ritual), and
Apple HIG (typography, motion, touch targets).

## The five rules

1. **Never let the learner speak into a void.** Every audio state is
   visible: tutor speaking = pulsing dots; mic warming = breathing orb +
   tone + haptic; listening = orb moving with the learner's actual voice
   level (volumechange events) + live partial transcript. The current
   state is also named in a large bold banner above the card (Listen /
   Think it / Say it / result) — readable at arm's length. If the screen
   is still, the app is idle — anything else is a bug.
2. **The learner ends the utterance, not the OS.** Recognition runs in
   continuous mode; an attempt finalizes only on tap-the-orb, ~2.6s of
   true post-speech silence, or the 12s cap. Beginners pause mid-sentence
   to construct — that pause is the method (plan §2.3), never a timeout.
   Corollary: **the mic is never open while the tutor speaks** (echo leaks
   into transcripts). Audio-session corollary: the playback session never
   sets `allowsRecording` — that flips iOS into the phone-call category and
   routes the tutor to the earpiece; only the recognizer opens a
   playAndRecord session, with `defaultToSpeaker`.
3. **Motion is state, not decoration.** Transitions communicate "heard
   you / thinking / your turn / result." Springs over linear, 200–350ms,
   one entering animation per state change. No idle animation except the
   think-breath and tutor dots. Haptics mirror the audio: light impact on
   mic-open, success/warning notification on pass/near, soft on miss.
4. **Results inform, never judge.** The feedback sheet shows the answer
   big with missed blocks underlined, the verbatim transcript always
   (§3.1), the decompose line on a miss — in green/amber/slate. No red
   anywhere, ever (§2.4). Praise copy is flat and earned: "Yes." not
   "Amazing!!!".
5. **Leaving is always safe.** Every advance persists the exact step;
   X confirms and exits; Home offers Resume. No progress is ever lost by
   navigation. Sessions open and close with a spoken ritual (session_open,
   victory_intro, session_close) so the ears know where they are too.

## Texture

- Two palettes (dark + light, System/Dark/Light in Settings), one hue
  logic: surfaces `bg → card → raised` (+ `stroke`); content
  `text / dim / faint`. The "alive" family is analogous green→teal:
  accent = go/pass/progress, `live` teal = the learner's own voice
  (transcripts, mic glow, resume). Muted apricot is **near-miss only** —
  a saturated yellow is blue's complement and vibrates against the dark
  base; never use it for ambient UI. Slate = miss/info. All colors come
  from `palettes` in src/theme.ts via `useTheme()` — components own a
  `makeStyles(p)` factory, no module-level color literals.
- Type scale 44/34/26/21/17/14/12, weight 800 for numbers and titles,
  tabular numerals for stats. Uppercase letter-spaced eyebrows for section
  labels.
- 56pt primary targets, 44pt minimum. Radii 16/24/32. SF Symbols only —
  no icon fonts, no emoji in UI chrome.
- The screen is a remote control (plan §1): one focal element per moment,
  controls contextual to the phase, everything reachable with a thumb.
