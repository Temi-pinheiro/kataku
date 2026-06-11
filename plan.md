# Kataku — Voice-First Language Learning App
### Build plan for Claude Code

> Working title "Kataku" ("my words" in Indonesian) — rename freely.

---

## 0. How to use this plan

This document is the source of truth for building a personal, single-user, voice-first language learning app. Work through the milestones (Section 9) in order — each has acceptance criteria. M0 exists to de-risk the two assumptions everything else depends on, so do not skip it.

On first session: scaffold the repo, then create a `CLAUDE.md` capturing the conventions in this plan (stack, file layout, content schema) so future sessions stay consistent. For current Claude Code conventions and configuration, consult https://docs.claude.com/en/docs/claude-code/overview rather than assuming.

The three product decisions in Section 11 are now resolved — **iPhone**, **AI coach on**, **Indonesian first**. Build against them.

---

## 1. Vision and constraints

**Problem.** The owner learns languages fast using a Michel Thomas–style spoken method, but today that only happens in chat sessions at a laptop. The essence of the method is *speaking*, and a keyboard interface loses it. The fix is a phone app where the entire lesson happens through the ears and mouth.

**Product in one sentence.** A pocket teacher: it sounds out building blocks, asks you to say things, listens, corrects you gently, and shows you once a week how much you can now say.

**Hard constraints:**

- Voice-first. Every lesson must be completable without reading the screen. The screen is a remote control (play/pause, repeat, slower), not the medium.
- Single user. No auth, no accounts, no server-side user data. Local-first.
- Five languages at launch: Indonesian, Mandarin, French, Italian, Spanish.
- Daily cadence with no ceiling: one core session marks the day done, but the learner can keep going indefinitely.
- Near-zero running cost. Target: **~$1–2/month** in steady state (AI coach enabled; $0 with it toggled off), a few dollars one-time per language for audio generation, plus the Apple Developer fee (Section 6). (Cost strategy in Section 4.)
- Simple UI. A handful of screens, large controls, no gamification clutter.

**Definition of done for v1.** The owner can complete the entire Indonesian Foundation course by voice on their phone, sees a weekly review of what they can now say, and the app runs for no more than a couple of dollars a month.

---

## 2. The method (pedagogy spec)

The lesson engine must embody Michel Thomas method *principles*. Important: we implement the methodology with **fully original curriculum content** — never reproduce scripts, sentences, or sequencing copied from the actual Michel Thomas courses, which are copyrighted audio products. The principles below are the spec:

1. **The teacher carries the burden.** The learner is never told to memorize, review, or do homework. If something is forgotten, that is the app's scheduling problem, not the learner's.
2. **Building blocks, combined immediately.** Each new item (a word, a structure, a pattern) is taught in seconds and then immediately used inside sentences with previously known blocks. Nothing is taught in isolation.
3. **The core loop is cue → think → speak → confirm.** The app gives an English cue ("How would you say: *I want to eat now*?"), leaves a silent think-window, listens to the learner's attempt, then plays the correct native-speed answer. The learner constructs language; they never parrot long strings they don't understand.
4. **Errors are information, never failure.** On a miss: replay the correct form, decompose into the blocks involved, invite one retry, then move on. The missed structure is silently queued for recycling. No buzzers, no streak-breaking, no scolding.
5. **High-leverage first.** Start with structures that unlock the most sentences fastest:
   - *Romance languages (FR/IT/ES):* cognate conversion rules (-tion/-ción/-zione, -ible/-able, -ent/-ente), modal scaffolds ("I want to / I can / I have to" + infinitive), pronouns, negation, question intonation.
   - *Indonesian:* exploit the absence of conjugation and tense morphology — verbs work immediately, so sentence-building accelerates from day one; teach time-markers (sudah/belum/akan) as blocks.
   - *Mandarin:* SVO scaffolds with high-frequency verbs (要, 想, 可以, 有), tones drilled through echo on every new word, measure words deferred until Builder phase.
6. **Sentences grow fast.** Two-word sentences on day one, five-word sentences by day three, multi-clause sentences ("I can't do it today because I don't have time") by the end of week one.
7. **Sessions end on a win.** Every session closes with a "victory lap": three long sentences the learner builds entirely themselves from known blocks, then a one-line spoken summary of what they can now do.
8. **Course arc:** **Foundation** (14 daily core sessions, ~15–20 min each → conversational ability: wants, plans, questions, opinions, past/future in simple form) → **Builder** (week 3 onward: thematic expansion, connectors, richer tense/aspect, real-situation drills) → learner continues until *they* feel comfortable. No fixed end.

Two refinements from good tutoring practice: praise specifically and only when earned (no hollow "great job!" after every utterance), and end-of-session summaries should state plainly what was covered and what's next.

---

## 3. The core experience

### 3.1 The voice loop (one prompt)

State machine per prompt:

```
PLAY_CUE → THINK_WINDOW → LISTEN → EVALUATE → FEEDBACK → next
```

- **PLAY_CUE:** English cue audio (pre-generated). Example: "How would you say — *she wants to come with us tomorrow*?"
- **THINK_WINDOW:** configurable silence, default 4s (settings: 2–10s). A soft tone signals "mic open." Learner can tap to skip the wait or say it early.
- **LISTEN:** mic opens, on-device speech recognition in the *target language locale*, ends on end-of-speech detection or a 10s cap.
- **EVALUATE:** normalize and compare the transcript against the prompt's accepted variants (Section 3.3).
- **FEEDBACK:**
  - *Pass:* brief confirm + native-speed correct answer plays once. Move on.
  - *Near-miss:* "Almost — listen:" + correct answer, one retry.
  - *Miss:* decompose ("Remember, *with us* is …"), play the answer slowly then at speed, one retry, then move on regardless. Queue item for recycling.
  - In all cases, the app shows (and on request, speaks) **the verbatim transcript of what it heard in the target language** — never a translation of it. The learner should see exactly what a native listener would have parsed.

### 3.2 The daily session

- **Today's session** = the next lesson chunk: ~2–4 new blocks, ~12–20 prompts mixing new blocks with recycled ones, victory lap, summary. Target 15–20 minutes.
- Completing it marks the day. A **"Keep going"** button immediately starts the next chunk — unlimited. Progress through the course is gated only by mastery, never by the calendar.
- **Recycling queue:** a lightweight spaced scheduler (strength 0–5 per item; due intervals roughly 1, 2, 4, 8, 16 days, halved on a miss). Recycled items never appear as flashcards — they appear as *components inside new sentence prompts*, which is the Michel Thomas way of reviewing without "reviewing."
- Daily local notification (optional, default 8am) — gentle, no guilt copy.

### 3.3 Answer matching (the free "intelligibility judge")

Key insight that keeps this app free: **if the on-device speech recognizer for the target locale transcribes your speech as the expected sentence, you were intelligible.** The recognizer is the pronunciation gate.

Algorithm:
1. Normalize transcript and expected variants: lowercase, strip punctuation, collapse whitespace. Keep diacritics (French/Spanish/Italian accents arrive correctly from STT). For Mandarin, compare on hanzi; additionally fold both sides to toneless pinyin as a secondary "near" check.
2. Each prompt stores `expected: string[]` — the canonical answer plus acceptable variants (e.g., Indonesian with/without optional pronouns, Spanish with/without subject pronoun).
3. Exact or variant match → **pass**. Token-level Levenshtein similarity ≥ 0.8 → **near**. Else **miss**.
4. Log every attempt (transcript, result, timings) — this feeds the weekly review.

Mandarin caveat: STT uses context to forgive tone errors, so tones are trained primarily through the echo step on new words (listen → repeat → listen again), a visible pinyin-with-tone-marks assist on screen, and optionally a stretch tone-scoring feature (Section 9, stretch).

### 3.4 Screens (all of them)

1. **Home:** language switcher, big "Start today's session" button, streak-free progress glance (day N of Foundation / Builder), "Keep going" if today is done.
2. **Session:** one giant card: current cue text (small), waveform/mic state, transcript of what was heard, three buttons — Repeat, Slower, Skip. Pause anywhere. Screen-dim "walking mode" keeps audio + mic going with the screen dark.
3. **Weekly Review:** Section 8.
4. **Settings:** think-time, playback speed (0.75×/1×), session length, notification, per-language voice choice, feedback depth toggle (Section 4.3), month-to-date API spend + soft cap (Section 4.4), data export/import (JSON to Files app).

That's the whole app. Resist adding more.

---

## 4. Voice architecture and cost strategy

This is the section that answers "what will this cost?" Three voice jobs, three different answers. Pricing figures researched June 2026 — re-verify current rates at build time.

### 4.1 Speaking to the learner (TTS) → pre-generate once with whichever voice wins a bake-off, ~$0–25 per language, then free forever

All teaching audio is **scripted in advance** (the curriculum is fixed text), so there is no reason to pay for runtime TTS. A build-time script renders every teach-script, cue, and answer to audio files once; the app ships/downloads them as per-language packs and plays local files — instant, offline, free.

- **The realism rule (owner decision):** Indonesian and Mandarin packs use the most natural voice available, chosen by ear — not by price. The model audio is the learner's *entire* pronunciation input (rhythm, vowels, and for Mandarin, tone contours), so this is the one place premium spend pays off, and pre-rendering makes it a bounded one-time cost.
- **Voice bake-off (gates M2):** render an identical ~10-line sample (teach lines, answers at both speeds, one Mandarin tone-pair drill) through four providers — **ElevenLabs** (Multilingual v2 / v3; both support Indonesian and Mandarin; the free tier's ~10k chars/month covers the audition itself), **Azure neural** (zh-CN voices are a known strength; id-ID available; 500k chars/month free), **Google Chirp 3 HD / Gemini TTS**, and **OpenAI `gpt-4o-mini-tts`** (~$0.015/min; its instructions parameter — "speak slowly and clearly, like a patient language teacher" — is useful for the slow renders). Owner listens blind, picks a winner per language, locks it.
- **Spend-splitting trick:** only *target-language* lines (teach words, answers, drills) need the premium voice — roughly half the characters. English cues render on cheap OpenAI TTS or Azure free tier. This halves premium spend per pack.
- **Cost per pack by winner:** Azure free tier → $0; OpenAI → ~$1–3; ElevenLabs → roughly one month of a paid plan (~$5–22 depending on current tier quotas) covers a Foundation pack's target-language lines, cancellable after rendering. Verify current plan quotas before committing.
- **Mandarin-specific rendering:** every new word also gets an isolated clip (and per-syllable clips for multi-syllable words) for echo drills. The "slow" answer renders via the provider's speed/SSML controls — never naive time-stretching — so tone contours stay intact.
- Runtime fallback for any dynamic line (rare): `expo-speech` (the OS's built-in TTS) — free, lower quality, acceptable for incidental strings only.
- Pipeline detail: store rendered audio keyed by content hash so re-renders only touch changed lines.

### 4.2 Listening to the learner (STT) → on-device, $0

Primary: **native platform speech recognition** via `expo-speech-recognition` (wraps iOS `SFSpeechRecognizer` and Android `SpeechRecognizer`). Free, low-latency, supports partial results and end-of-speech detection, and supports all five target locales (`id-ID`, `zh-CN`, `fr-FR`, `it-IT`, `es-ES`). Prefer `requiresOnDeviceSpeechRecognition` where the locale's on-device model is available; otherwise the OS's networked recognition is still free. **Validating recognition quality for `id-ID` and `zh-CN` on the actual device is the M0 spike** — it is the riskiest assumption in this plan.

iPhone-only bonus (platform now decided): also evaluate `expo-speech-transcriber` in M0 — an iOS-only wrapper that uses Apple's newer `SpeechAnalyzer` on recent iOS versions and reportedly transcribes more accurately on modern iPhones than `SFSpeechRecognizer`. Pick per-locale whichever library hears learner Indonesian and Mandarin best; abstract STT behind one interface either way.

Cloud fallback (optional, off by default): when local recognition repeatedly fails on a prompt, send the recorded clip to **`gpt-4o-mini-transcribe` (~$0.003/min)** or **Whisper (`$0.006/min`)** for a second opinion. Even used on every single prompt — which we won't — 30 min/day costs under $3/month.

### 4.3 Coaching the learner (LLM feedback) → optional tier, pennies

- **Tier 0 (default, free):** matching algorithm in 3.3 + pre-scripted decomposition lines authored with each lesson. This already covers ~95% of feedback needs because misses are predictable per prompt.
- **Tier 1 (decided: on by default; settings toggle to disable):** on a second miss, send {cue, expected, transcript} to a small LLM for one targeted spoken correction ("You said *saya mau pergi ke* — you're missing *besok*; in Indonesian, time words usually go at the end here"). A few hundred tokens per call; at realistic usage this is well under $1–2/month. Render its reply with device TTS or a one-off API TTS call. The API key lives on-device only (injected at build time or kept in secure storage), never committed to the repo — acceptable for a single-user personal build.
- **Tier 2 (stretch):** see Section 9 — free-conversation mode and pronunciation/tone scoring.

**Steady-state monthly cost as configured: ~$1–2 (Tier 1 on); $0 with it off.** One-time: a few dollars per language for audio rendering.

### 4.4 Measuring the real spend (cost meter)

The owner's first month is explicitly a cost experiment: what does a dedicated daily learner actually spend? The app must answer that question itself. Every paid API call (coach, cloud STT fallback, and later tone scoring and conversation mode) goes through one thin client wrapper that logs `{provider, feature, units, unit_price, cost}` to an `api_spend` table; unit prices live in a config file so price changes are a one-line edit. Settings and the weekly review both show month-to-date spend — the review states it plainly next to minutes practiced ("this week: 142 minutes, $0.43"). A soft cap in settings (default $10/month) switches paid features off with a spoken notice rather than failing silently.

---

## 5. Curriculum and content pipeline

Content is data, not code. The app is a player; courses are JSON + audio packs.

### 5.1 Content schema (per language)

```jsonc
{
  "language": "id",
  "phase": "foundation",
  "units": [{
    "index": 1,
    "title": "Wanting and doing",
    "lessons": [{
      "index": 1,
      "items": [{
        "id": "id-f-001",
        "type": "block",            // block | pattern | usage_note
        "concept_en": "to want",
        "target_text": "mau",
        "romanization": null,        // pinyin for zh
        "teach_script": "The word for 'want' in Indonesian is 'mau'. Mau.",
        "audio": { "teach": "id-f-001-t" }
      }],
      "prompts": [{
        "id": "id-f-p-004",
        "cue_en": "I want to eat now.",
        "expected": ["saya mau makan sekarang", "aku mau makan sekarang"],
        "components": ["id-f-001", "id-f-002", "id-f-003"],
        "difficulty": 1,
        "decompose_script": "Remember — 'now' is 'sekarang', and it goes at the end.",
        "audio": { "cue": "id-f-p-004-c", "answer": "id-f-p-004-a", "answer_slow": "id-f-p-004-s" }
      }]
    }]
  }]
}
```

### 5.2 Authoring workflow

1. A written **pedagogy spec** (Section 2, expanded per language with sequencing notes) lives in `content/SPEC.md`.
2. Lesson scripts are **generated inside Claude Code sessions** following the spec — this is part of development, no separate generation infrastructure. Generate one unit at a time.
3. The owner **reviews and edits** each unit (they are the learner *and* editor; for Indonesian they have daily-life context in Bali to sanity-check naturalness). Native-speaker spot-checks are a nice-to-have.
4. Freeze the unit → run `scripts/render-audio.ts` → audio pack updated.
5. Validation script checks: every `expected[0]` round-trips through normalization, every audio key has a file, every prompt's components exist, no orthography drift between `target_text` and `expected`.

Build Indonesian Foundation first (pending Section 11 decision), prove the loop end-to-end, then replicate per language with language-specific sequencing.

### 5.3 Originality rule

Restated because it matters: content must be original. Use the method's *principles*; never transcribe, paraphrase course-by-course, or mirror the lesson sequence of the actual Michel Thomas (or any other) commercial course.

---

## 6. Tech stack

| Layer | Choice | Why |
|---|---|---|
| App framework | **Expo (React Native, TypeScript)** | One codebase for iOS + Android; best-supported path for a Claude Code–built personal app; dev builds install on your own phone without app-store release |
| Audio playback/recording | `expo-audio` | Local file playback, recording for cloud-fallback clips |
| Speech recognition | `expo-speech-recognition` | Free native STT, partial results, end-of-speech detection, on-device option |
| Fallback TTS | `expo-speech` | Free OS voices for dynamic lines |
| Storage | `expo-sqlite` | Progress queries (recycling queue, weekly stats) want SQL; JSON export for backup |
| State | Zustand (or React context) | Keep it boring |
| Content/audio delivery | Bundled in app or per-language pack downloaded from free static hosting (GitHub Releases / Cloudflare R2 free tier) | No backend |
| Backend | **None** | Single user, local-first |
| Notifications | `expo-notifications` (local only) | Daily nudge |

Distribution (**decided: iPhone**):
- **Recommended: $99/yr Apple Developer account + TestFlight.** Builds install over the air and last 90 days each, so the phone stays current with a rebuild every couple of months. This is the only meaningful recurring cost in the project, and it buys exactly what the app exists for: never needing the laptop to keep learning.
- **Free alternative (not recommended):** personal-team signing expires every 7 days, forcing a weekly Mac + Xcode re-sign ritual — the laptop dependency this app is supposed to eliminate. Acceptable for the M0 spike only, before committing to the account.
- Build via EAS Build or local Xcode; check current EAS plan limits when setting up repeatable builds.
- Android remains possible later (the Expo codebase is cross-platform) but is out of scope for v1.

---

## 7. Data model (SQLite)

```
language(code PK, name, tts_voice, stt_locale, pack_version)
item(id PK, language, lesson_ref, type, concept_en, target_text, romanization)
prompt(id PK, language, lesson_ref, cue_en, expected_json, components_json, difficulty)
mastery(item_id PK, strength INT 0–5, last_seen_at, due_at)
attempt(id PK, prompt_id, at, transcript, result TEXT pass|near|miss, think_ms, retries)
session(id PK, language, started_at, ended_at, new_items, prompts_done, core_completed BOOL)
weekly_review(id PK, language, week_start, metrics_json, checkpoint_score)
api_spend(id PK, at, provider, feature, units REAL, unit, cost_usd REAL)
settings(key PK, value)
```

Content (items/prompts) is read-mostly, loaded from the JSON pack at install/update; progress tables are the learner's. Export/import = dump progress tables to a JSON file.

---

## 8. Weekly progress review — "how much can I say?"

Generated at the end of each calendar week (and on demand). Four elements, in order of emotional impact:

1. **The speakable-sentences counter.** The headline number: an estimate of distinct grammatical sentences the learner can now construct. Implementation: each language pack defines grammar templates with typed slots (`[subject] [modal] [verb] [object] [time]`…); count ≈ Σ over templates of the product of *mastered* fillers per slot, deduplicated, displayed rounded ("~2,400 sentences — up from ~900 last week"). It's an estimate and says so; its job is to make combinatorial growth visible, which is the deepest motivation mechanic the Michel Thomas approach has.
2. **Spoken checkpoint.** Ten cues sampled across the week's material (weighted toward weak items), full voice loop, scored /10. Optionally record and keep the learner's audio so week 6 can replay week 1 — the before/after is powerful.
3. **The honest stats.** Minutes practiced, sessions done, new blocks mastered, recycled items strengthened, toughest three items (by miss rate), and month-to-date API spend (Section 4.4).
4. **What's next.** One spoken+written line: "Next week: past tense and asking for things."

No grades, no red. The review is a mirror, not a report card.

---

## 9. Milestones

Each milestone ends with something runnable on a phone.

**M0 — De-risk (spike, throwaway code allowed)**
- Expo app boots on the owner's actual phone; mic permission flow works.
- Record → play back a clip; play a bundled audio file.
- `expo-speech-recognition` **and** `expo-speech-transcriber` return transcripts for **`id-ID` and `zh-CN`** (plus `fr-FR` sanity check) on the owner's iPhone, on-device where available; measure latency and accuracy on ~20 learner-ish utterances and pick a winner per locale.
- ✅ *Accept:* a one-screen demo: tap, speak Indonesian, see the transcript. Findings written to `docs/m0-findings.md`. If a locale fails on-device, document that networked native recognition (still free) is the path.

**M1 — The voice loop**
- Implement the prompt state machine (3.1) with one hardcoded 10-prompt Indonesian mini-lesson and locally rendered audio.
- Matching algorithm with variants + near-miss threshold; Repeat/Slower/Skip controls; think-window setting.
- ✅ *Accept:* the owner completes the mini-lesson entirely by voice, eyes closed.

**M2 — Content pipeline**
- Content schema, validation script, `render-audio.ts` (hash-keyed, two speeds per answer), pack loader.
- Voice bake-off (4.1): identical sample rendered through all four providers for Indonesian (run the Mandarin sample at the same time); owner picks the pack voice **before** the full week renders.
- Author + render **Indonesian Foundation, Week 1** (7 lessons) per the pedagogy spec; owner reviews scripts before rendering.
- ✅ *Accept:* week 1 playable end-to-end from the JSON pack; re-rendering only touches changed clips.

**M3 — Session engine and progress**
- SQLite schema; daily session assembly (new + recycled); mastery/recycling scheduler; "Keep going" unlimited chunks; Home screen; local notification.
- ✅ *Accept:* three consecutive real days of use produce sensible recycling behavior (missed items reappear inside new sentences sooner).

**M4 — Weekly review + AI coach**
- Metrics computation, speakable-sentences estimator (templates authored for Indonesian), spoken checkpoint flow, review screen.
- Tier-1 coach (4.3): triggers on second miss, one spoken correction, on/off in settings, on-device key handling.
- Cost meter (4.4): spend-logging wrapper around all paid calls, settings + review display, soft cap.
- ✅ *Accept:* after a real week, the review shows a plausible counter, a checkpoint score, and stats matching the attempt log; a deliberately repeated mistake produces one useful spoken correction; the spend meter matches a hand-tally of the week's API calls.

**M5 — Five languages + polish**
- Author Foundation for the remaining four languages (sequenced per 2.5), per-language packs + download flow, voice auditioning, walking-mode screen dim, settings complete, data export/import.
- ✅ *Accept:* all five languages installable and playable; steady-state spend $0/month.

**Stretch (post-v1) — fully specced in `stretch-spec.md`**
- **S1 Conversation mode:** spoken free dialogue constrained to mastered vocabulary — build right after Indonesian Foundation completes (~week 3 of real use); it's the retention feature for the back half of the test month.
- **S2 Mandarin tone scoring:** Azure Pronunciation Assessment, syllable-level — build when Mandarin starts.
- **S3 Builder thematic packs:** Bali-practical Indonesian first; rolling content work.
- Lock-screen / background-audio session mode (platform-restricted for mic; investigate).

v1 must keep three doors open for these (zero extra effort if done from the start): STT behind a single interface, attempt audio clips retained on a rolling 30 days, and the mastery table queryable as a vocabulary whitelist.

---

## 10. Risks and mitigations

| Risk | Why it matters | Mitigation |
|---|---|---|
| On-device STT weak for `id-ID`/`zh-CN` or for accented learner speech | The free-listening strategy depends on it | M0 spike first; networked native recognition is still free; cloud fallback per 4.2 |
| STT "forgives" Mandarin tone errors | Learner could fossilize wrong tones | Echo-drill every new word, pinyin tone display, stretch tone-scoring |
| Recognizers auto-correct near-misses into the right answer | False passes | Compare against partial results too; keep near-miss threshold strict; spot-audit with recorded clips |
| iOS 7-day signing expiry (free account) | Weekly rebuild friction | Resolved: $99/yr developer account + TestFlight (Section 6); free signing only for the M0 spike |
| Generated curriculum has unnatural phrasing | Bad habits in a real language | Owner review gate before rendering; Bali daily life as a live Indonesian testbed |
| Audio pack size | 5 packs ≈ 200–400 MB | Per-language download, not bundled |
| Copyright | MT courses are commercial products | Originality rule (5.3) enforced at authoring review |

---

## 11. Decisions log

Resolved by the owner, 10 June 2026:

1. **Platform: iPhone.** Distribution per Section 6 — Apple Developer account + TestFlight; free signing only for the M0 spike.
2. **Feedback depth: Tier 1 AI coach, on by default** (~$1–2/month), with a settings toggle to disable. Built in M4.
3. **First language: Indonesian.** Fastest Michel Thomas–style wins (no conjugation), and the owner lives in it daily — every authored unit gets street-tested in Bali.

---

## 12. Explicitly out of scope (v1)

Auth/accounts/multi-user, cloud sync, app-store release, social features, streaks/leagues/XP, reading & writing instruction (romanization is a pronunciation aid, not a literacy course), languages beyond the five, payments.

---

## 13. Cost summary

| Item | When | Amount |
|---|---|---|
| TTS rendering (bake-off winner; premium voices for id/zh) | One-time (per pack) | $0–25 each |
| STT (on-device native) | Monthly | $0 |
| Cloud STT fallback (optional) | Monthly | ~$0–2 |
| LLM coach Tier 1 (on by default) | Monthly | ~$1–2 |
| Mandarin tone scoring (S2, once zh starts) | Monthly | ~$1–5 |
| Conversation mode (S1, post-Foundation) | Monthly | ~$1–4 |
| Hosting/backend | Monthly | $0 |
| Apple Developer account (decided: TestFlight path) | Yearly | $99 |

**One-month test forecast, heavy daily use:** running costs ≈ $2–6 (coach + occasional cloud STT), plus the one-time Indonesian pack render ($0–25 depending on the bake-off winner); adding conversation mode from week 3 brings the realistic all-in month to **roughly $5–15**. The cost meter (4.4) replaces this forecast with the real number — that's the point of it.

*Pricing snapshot June 2026; verify current rates before rendering.*
