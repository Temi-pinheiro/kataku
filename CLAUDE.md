@AGENTS.md

# Kataku — voice-first language learning app

Single-user, local-first, iPhone-first. `plan.md` is the source of truth
for v1; `final-spec.md` (owner-decided 2026-06-12) specs the final app —
F0 v1-completions, F1 pronunciation lab, F2 story mode, F3 live capture,
F4 persona voices, F5 mastery map, protocol-week-as-spine — and supersedes
`stretch-spec.md` where the teacher-chat pivot changed things (S2→F1,
S3 reframed into protocols/scenarios; stretch-spec's v1 hooks stay
contractual). Read plan.md + final-spec.md before changing architecture.
Final-spec features build only AFTER the pre-build roadmap (conversation
mode signed off → protocols promoted → it → archive → push →
first TestFlight build).

## Stack (decided — don't churn)

- Expo SDK 56, React Native, TypeScript. Check https://docs.expo.dev/versions/v56.0.0/ before using Expo APIs — SDK 56 changed things.
- Audio: `expo-audio` behind `src/services/voice-engine.ts` (ONE app-life audio-session config — see the engine header; do not regress). STT: `expo-speech-recognition` behind the `SpeechRecognizer` interface in `src/lib/stt/types.ts`; implementations live in `src/services/stt/`. `expo-speech-transcriber` rejected (en_US-only); **`expo-speech` REMOVED — no device-TTS fallback, ever (owner directive)**: missing audio = silence + text. Dynamic lines voice via `src/services/tts.ts` (OpenAI, disk-cached per line); static packs stay on the rendered ElevenLabs clips.
- **The primary lesson is the teacher chat** (`TeacherScreen` + `src/services/teacher.ts`, owner pivot 2026-06-11): an LLM teacher running the owner's Michel Thomas protocols, text-first, per-bubble audio on demand, voice input via the recognizer. **The protocols live VERBATIM in `content/teacher/<language>-protocol.md` (owner's instruction files — source of truth; never paraphrase them in code).** Edit the .md → `npm run embed-protocols` regenerates `src/generated/teacher-protocols.ts`; `teacher-prompt.ts` only adds the app adapter. The deck flow (`SessionScreen`) remains as the offline "classic drill deck" under Settings. API key lives in the device keychain (`src/services/keys.ts`); all teacher/TTS/conversation calls are cost-metered.
- **Conversation mode** (`ConversationScreen` + `src/services/conversation.ts`, stretch S1 pulled forward): the only voice-to-voice surface — scenario + mood picker, partner speaks (runtime TTS) → mic auto-opens → recast corrections → spoken debrief. v1 level constraint is a per-language prompt summary, not yet the mastery whitelist.
- Storage: `expo-sqlite`, schema in `src/db/schema.ts` (mirrors plan.md §7). State: zustand.
- No backend, no auth, no analytics. Content = JSON packs + pre-rendered audio.

## Layout

- `src/lib/` — pure logic, **no react-native imports**, unit-tested with vitest (`npm test`). Matching, scheduler, state machine, session builder, speakable counter, cost meter live here.
- `src/db/` — SQLite schema + data access. `src/services/` — wrappers around native modules (STT, audio). `src/screens/` — the only four screens (Home, Session, WeeklyReview, Settings) plus `M0Spike` (reached via Settings → Developer). Resist adding screens. `src/components/` — shared UI (MicOrb, FeedbackSheet, etc.); UI work follows `docs/design-principles.md` (voice-state visibility, learner-ends-the-utterance, motion-as-state, no red, leaving is safe).
- UI stack: react-native-reanimated (motion), expo-haptics, expo-symbols (SF Symbols). Theme tokens in `src/theme.ts` only — no inline colors/sizes.
- `content/<lang>/` — course JSON per plan.md §5.1 schema; `content/SPEC.md` is the pedagogy spec. `content/<lang>/audio/` is gitignored (rendered, hash-keyed).
- `scripts/` — `validate-content.ts`, `render-audio.ts` (run with tsx via npm scripts).
- `docs/` — findings (`m0-findings.md`), `OWNER-TODO.md` (things only the owner can do).

## Hard rules

1. **Originality (plan §5.3):** curriculum content must be fully original. Never reproduce or paraphrase Michel Thomas (or any commercial course) scripts, sentences, or lesson sequences. Principles only.
2. **Voice-first:** every lesson flow must be completable without reading the screen.
3. **Cost:** every paid API call goes through the cost-meter wrapper (`src/lib/cost-meter.ts`) — no exceptions, including scripts where practical. Unit prices live in config, not inline.
4. **Stretch contracts (stretch-spec.md):** one STT interface; attempt audio retained rolling 30 days (16 kHz mono); `mastery` queryable as vocabulary whitelist; paid features degrade gracefully (skip + spoken notice, never block a session).
5. API keys: `.env` for scripts, secure storage on device. Never committed.
6. Content edits → run `npm run validate-content` before committing. Owner reviews every unit before audio is rendered.

## Conventions

- Audio file naming: `<audio-key>.mp3` under `content/<lang>/audio/`, where keys come from the content JSON (`id-f-p-004-c` etc.). Rendered files are keyed by content hash in `render-manifest.json` so re-renders only touch changed lines.
- Matching normalization (plan §3.3) is shared between app and validator — single implementation in `src/lib/matching/normalize.ts`.
- Times in DB are ISO 8601 UTC strings; durations are milliseconds.
- Tests: colocated `*.test.ts` next to the module.
