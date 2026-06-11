@AGENTS.md

# Kataku — voice-first language learning app

Single-user, local-first, iPhone-first. `plan.md` is the source of truth;
`stretch-spec.md` specs post-v1 features whose v1 hooks are contractual.
Read both before changing architecture.

## Stack (decided — don't churn)

- Expo SDK 56, React Native, TypeScript. Check https://docs.expo.dev/versions/v56.0.0/ before using Expo APIs — SDK 56 changed things.
- Audio: `expo-audio` (playback + attempt recording). STT: `expo-speech-recognition` behind the `SpeechRecognizer` interface in `src/lib/stt/types.ts`; implementations live in `src/services/stt/` and app code never imports recognizer packages directly (stretch contract). `expo-speech-transcriber` was evaluated and rejected (v0.1.9 is hardcoded to en_US — see docs/m0-findings.md). Fallback TTS: `expo-speech`.
- Storage: `expo-sqlite`, schema in `src/db/schema.ts` (mirrors plan.md §7). State: zustand.
- No backend, no auth, no analytics. Content = JSON packs + pre-rendered audio.

## Layout

- `src/lib/` — pure logic, **no react-native imports**, unit-tested with vitest (`npm test`). Matching, scheduler, state machine, session builder, speakable counter, cost meter live here.
- `src/db/` — SQLite schema + data access. `src/services/` — wrappers around native modules (STT, audio). `src/screens/` — the only four screens (Home, Session, WeeklyReview, Settings) plus `M0Spike`. Resist adding screens.
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
