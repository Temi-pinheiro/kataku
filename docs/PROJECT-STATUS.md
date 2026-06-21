# Kataku — project status

A single snapshot of where the project is: what's built, the decisions behind
it, what's deliberately not built yet, and what comes next. Source-of-truth
companion to `plan.md` (v1 spec) and `final-spec.md` (the final app, F0–F5).
Last updated 2026-06-21 (zh/ja removed; module spine + Recap/Continue added).

## What Kataku is

A voice-first, single-user, iPhone-first language tutor built on Michel Thomas
method principles. The teacher carries the load; the learner just speaks. One
user for now (the owner — learning Indonesian in Bali; conversational Spanish
and some French as quality baselines). No accounts, no backend, no analytics,
no gamification. Four Latin-script languages: Indonesian, Spanish, French,
Italian. (Mandarin + Japanese were removed 2026-06-21 — non-Latin scripts
didn't land well; the dual-script/pinyin machinery and the Mandarin-only F1
pronunciation lab went with them.)

## Status: build-ready

Typecheck clean · 90 unit tests green · content validates (0/0) · app.json +
eas.json configured (re-run `expo-doctor` before building). First TestFlight
build is the next action (instructions at the bottom / in the chat that
produced this).

## Stack & hard invariants (do not regress)

- **Expo SDK 56**, React Native, TypeScript. Check the SDK 56 docs before using
  Expo APIs.
- **One AVAudioSession config for the app's life** (`src/services/voice-engine.ts`):
  playAndRecord + defaultToSpeaker, mode 'default', never flips. The recognizer
  starts with the identical iosCategory. Flipping it was the root cause of the
  old earpiece/silence/crash bugs. All playback goes through the serialized
  voice-engine; orchestration is imperative (`prompt-runner.ts`), not effects.
- **No device/robot TTS, ever** (expo-speech removed). Missing audio = silence +
  text, never a synthetic fallback voice.
- **English is never spoken aloud** — only the target language has a voice.
  English is quiet on-screen text. Markup: target wrapped in «guillemets»
  (`src/lib/teacher-markup.ts`); for zh/ja the span is `«script|romanization»`
  — the app shows the romanization and speaks the script.
- **No red** anywhere; misses are information (slate), near-miss is apricot,
  green = pass/progress, teal = the learner's own voice. The learner ends the
  utterance (patience designed in), never a timeout.
- **Every paid API call goes through the cost meter** (`src/lib/cost/`).
- **Curriculum is fully original** (plan §5.3) — MT principles only, never MT
  course content.
- Providers: **Anthropic** teaches (Sonnet 4.6; Haiku 4.5 for the conversation
  partner; raw Messages API + prompt caching in `src/services/llm.ts`).
  **ElevenLabs** is the one voice everywhere (runtime TTS `src/services/tts.ts`,
  disk-cached; OpenAI is the cheaper fallback voice + the progress digest).
  Keys live in the device keychain (Settings → Keys); `.env` for scripts.

## What's built

- **Teacher chat** (`TeacherScreen`, the primary lesson) — text-first LLM teacher
  running each language's protocol; per-card target audio at a chosen teaching
  pace; voice answers via the recognizer; chat hierarchy (taught card > cue >
  verdict > ambient English); honest mic states (warming → live w/ real level
  bars → done); one focal element (history recedes, current card lifts); STT
  vocabulary hints; half-spoken answers persist across leaving. **Modules
  (2026-06-21):** every chat is scoped to one module of the course spine; the
  teacher is told which module to run + what's already known, and ends a
  finished section with a "= recap" marker → the app shows **Recap + Continue**
  (one tap to the next module; no more typing "continue"). Each module keeps
  its own transcript (jump to any from the map, revisit freely).
- **Conversation mode** (`ConversationScreen`) — the only voice-to-voice surface;
  scenario + mood, recast corrections, spoken debrief; patience floors so the
  partner never jumps the gun; "tap when you're done."
- **Stories** (`StoriesScreen` + `StoryPlayerScreen`) — read-along audio with a
  synced bilingual transcript (active line glows teal); editorial cream/serif
  skin; auto-scroll to the spoken line; gapless playback; runtime voice until a
  track is rendered. See "Stories" below.
- **Your map** (`MapScreen`) — the module spine, done/here/ahead from **real
  recorded module completion** (`module_progress` table), nothing locked;
  tapping any module points the teacher at it.
- **Weekly review** (`WeeklyReviewScreen`) — speakable-sentences counter + honest
  stats (spoken checkpoint + before/after replay still to come).
- **Settings** — segmented Think time / Coach mood / 3-speed speaking pace /
  spend soft-cap meter / Appearance (Auto·Dark·Light) / keys / export.
- **Home** — language-picker popover, suggestion + resume cards, the two CTAs,
  earlier-lessons strip, book button → Stories.
- **Classic drill deck** (`SessionScreen`) — the offline rendered-pack flow,
  under Settings; id/es/fr only.
- **Design system** — warm editorial light palette app-wide + dark; tokens in
  `src/theme.ts`; the full visual reference is `design_handoff_kataku/`.

## Four languages

All four teach + converse. Protocols (6-month arcs) are promoted and embedded
(`content/teacher/*.md` → `npm run embed-protocols`). The classic **drill-deck
packs** exist only for id/es/fr; Italian is chat/conversation/stories only (it
degrades gracefully — Home shows "words you own", the deck row hides).

## Stories

- **Catalog** (`src/content/stories.ts`, `content/stories/CATALOG.md`): 30
  stories. Standard scenes (arrival/market/etc.) plus a **listening ladder per
  language** (`src/content/story-ladders.ts`): 4 graduated rungs — 2 Beginner,
  1 Intermediate, 1 Advanced — at ~2/4/6/8 min, to harden the ear.
- **Audio**: rendered + embedded **manually**, owner-gated. Until a track is
  rendered the player speaks each line with the runtime voice (same ElevenLabs
  voice, gapless, cached) — so every story is playable today. Per-story
  character counts for ElevenLabs sizing: `content/stories/LADDER-COUNTS.md`
  (the four Latin-script ladders; real rate is plan-dependent).
- **Illustrations**: `Story.thumb`/`Story.hero` fields are wired — commissioning
  art is a data-only drop-in (square ≥144² thumb, ~750×380 hero, warm/painterly).
  Gradient placeholder until then.
- **Scale**: `content/stories/SCALE-SPEC.md` blueprints a future 15–20 min "epic"
  tier (investor/scale readiness) — not built.

## Cost picture (steady state, metered)

Teacher chat (Sonnet, cached) ~$3–10/mo · conversation (Haiku + ElevenLabs)
~$1–4/mo · stories (one-time renders, paced) · digests/reviews < $1/mo. All-in
~$6–19/mo with 1–2 active languages. The cost meter, not estimates, is the
truth. (Module switches re-send the system prompt uncached — a few cents/session,
negligible.)

## Owner-gated / not built yet

- **Stories**: render produced audio (per-episode, ~$ in LADDER-COUNTS);
  commission illustrations.
- **F3 Live capture** — grab a phrase from real life → woven into the next lesson.
- **F4 Persona voices** — distinct voices for conversation partners / story cast.
- **F0 finishers** — daily notification, spoken checkpoint + before/after replay
  in the weekly review, data import.
- **Produced-track karaoke** — real audio scrubber/timestamps (runtime per-line
  covers it now).
- **Background/lock-screen audio** for stories — investigation gated by the
  one-audio-session rule.

## Next steps (recommended order, after the first TestFlight build)

1. **Live in the app for a week** on TestFlight — real Bali use surfaces what
   actually matters next better than guessing.
2. **F3 live capture** — highest daily value for the owner's context.
3. **F4 persona voices** — distinct voices for conversation partners / story cast.
4. **F0 finishers** (notification, spoken checkpoint).
5. **Stories production** — render + illustrate as desired.
6. Extend the non-id story catalogs if wanted.

## Build & ship

- **Push to GitHub** (remote `origin` → github.com/Temi-pinheiro/kataku already
  set): `git push -u origin main`.
- **TestFlight** via EAS: `eas init` (link the project) → `eas build --platform
  ios --profile production` (Apple login + 2FA at the credentials step) →
  `eas submit --platform ios --profile production`. Then App Store Connect →
  TestFlight → answer export compliance → install via the TestFlight app.
- On-the-go without TestFlight: `npx expo run:ios --configuration Release
  --device` (paid Apple account signs ~1 year, no dev server).
- JS-only changes never need a rebuild; the native module set is frozen.
