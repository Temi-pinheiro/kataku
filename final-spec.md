# Kataku — Final App Spec (F0–F5)
### The complete feature set, and how everything comes together

Companion to `plan.md` (still the v1 source of truth) and successor to
`stretch-spec.md` where the 2026-06-11 teacher-chat pivot changed the world:
S1 conversation mode is **built** (ahead of spec — runtime ElevenLabs voice,
recasts, spoken debrief, patience-window mic); S2 tone scoring is **absorbed
into F1**; S3 builder packs are **reframed** — themes now live in the
6-month protocols and conversation scenarios, not 8-lesson JSON packs.
The stretch contracts carry forward unchanged and now have paying tenants:

1. One STT interface (`SpeechRecognizer`) — F1/F3 reuse it.
2. Attempt audio retained rolling 30 days, 16 kHz mono — **switched ON by
   F1** (it has been contractually reserved, but off, since v1).
3. `mastery` queryable as a vocabulary whitelist — F2 stories and S1
   conversations are both constrained by it; F5 visualizes it.
4. Every paid call through the cost meter. No exceptions.
5. Paid features degrade gracefully: skip + spoken notice, never block.

Decided by the owner, 12 June 2026: all of F1–F5 are in the final cut;
Home stays a **menu with a suggestion** (no auto-orchestrated day);
pronunciation scoring fires **automatically for Mandarin only**, on demand
elsewhere. Absolute rules restated because every module touches voice: no
device TTS ever (missing audio = silence + text); no spoken English ever;
«guillemet» markup is the one bridge between text and speech; ONE
app-life audio-session config (see `src/services/voice-engine.ts`).

**Sequencing:** nothing in this spec may delay the pre-build roadmap
(conversation mode sign-off → 6-month protocols promoted → it/zh/ja added →
archive → commit → push → first TestFlight build). F0–F5 are the build
queue **after** the first build is on the owner's phone.

---

## §1 — The spine: how everything comes together

**The protocol week is the spine; every module orbits it.**

Each language's protocol (`content/teacher/<lang>-protocol.md`) defines a
6-month arc: weeks 1–2 crash course, weekly targets to week 8, monthly
phases to month 6. The app tracks **protocol position** per language and
every surface consults it:

| Surface | Reads the spine for | Writes back |
|---|---|---|
| Teacher chat | where to resume teaching | position (via digest), mastery |
| Conversation | scenario themes at the learner's level | mastery (via debrief digest) |
| Story mode (F2) | topic + structures for the episode | listening history |
| Live capture (F3) | — (life writes in) | provisional items → next lesson |
| Weekly review | what to sample for the checkpoint | checkpoint scores |
| Mastery map (F5) | the "you are here" header | — |
| Suggestion chip (§1.2) | what to suggest next | — |

### 1.1 Protocol position

```
protocol_position(language PK, week INT, day INT, phase TEXT, updated_at)
```

The existing progress digest (already extracting taught/solid/shaky every
8 learner turns) gains one field: `protocol_week` — the model's judgment
of where in the protocol the lesson now sits. Best-effort like the rest of
the digest; never blocks a lesson; monotonic (never moves backward without
an explicit owner reset in Settings).

### 1.2 Home: menu with a suggestion (owner decision)

Home remains an explicit menu of modes. Above it, ONE suggestion chip,
computed **locally and deterministically** (`src/lib/suggest.ts`, pure,
unit-tested, zero API calls), first matching rule wins:

1. No practice yet today → "Continue week N with the teacher" (resumes chat).
2. Teacher session done today, conversation unlocked → "Try the
   <current-week-theme> conversation."
3. ≥ 8 shaky items in the scheduler → "5 minutes of review" (drill deck,
   shaky items only).
4. It's review day (Sunday or 7+ days since last review) → "Your weekly
   review is ready."
5. ≥ 2 unworked captures (F3) → "Ask the teacher about what you caught."
6. Otherwise → "Listen to episode N" (F2) or nothing.

The chip is a shortcut, never a gate — every mode stays one tap away, and
ignoring the suggestion has zero consequences (leaving is safe; no streaks).

### 1.3 One voice identity, plus a cast

The teacher speaks with THE voice — the pack/bake-off voice — everywhere:
teacher chat, debriefs, reviews, story narration. Conversation **personas**
get their own voices (F4). All runtime TTS flows through `ttsToFile`
(pace-aware, disk-cached, metered); all playback through the voice engine.

### 1.4 One ledger

Every module's calls land in the existing cost meter under their own unit
(`elevenlabs:tts_runtime`, `azure:pron_assess`, `anthropic:story`, …). The
weekly review shows month-to-date spend by module; the soft cap behaves
identically everywhere: skip the paid step, say so once, keep the session.

---

## F0 — v1 completions (the unfinished promises)

Not reach — debt. These predate the pivot and the final app needs them.

### F0.1 Weekly review, finished (plan §8)
- **Speakable-sentences counter** as the headline (lib exists; templates
  authored per language; chat-taught items count via their mastery rows).
- **Spoken checkpoint:** ten cues sampled across the week, weak-weighted,
  run by the teacher voice in the full voice loop; scored by the existing
  free matcher (cues are known items). /10 result, no red, no grades.
- **Before/after replay:** this week's attempt audio vs the same item
  weeks ago (F1's archive makes this possible). The week-6-hears-week-1
  moment is the single most motivating artifact the app can produce.
- Honest stats: minutes, sessions, new/strengthened items, toughest three,
  spend by module.

### F0.2 Daily notification (plan M3)
One local notification, default 08:00, opt-in at first review, time
editable in Settings. Copy is an invitation, not a guilt trip. Deep-links
to Home with the suggestion chip already computed.

### F0.3 Export / import
One tap in Settings → zip of the SQLite DB + settings + capture log
(NOT the audio caches — they re-render/re-record) → iOS share sheet.
Import restores wholesale with a confirmation. This is the only backup
story a single-user local-first app needs.

### F0.4 Offline matrix (the degradation contract, written down)

| Feature | Offline / no key behavior |
|---|---|
| Drill deck + rendered packs | fully functional (the offline core) |
| Teacher chat | composer disabled, transcript readable, "back online" note |
| Conversation | unavailable, says so in one line |
| Story mode | cached episodes replay; no new generation |
| Pronunciation lab | A/B replay works (local audio); no scores |
| Live capture | records + queues; explanation arrives when online |
| Weekly review | fully functional except fresh TTS lines (cached ones play) |

Acceptance for F0: a full week of real use produces a review with a
plausible counter, a checkpoint score, week-over-week replay, and stats
matching the attempt log; notification fires once daily at the set time;
export → wipe → import round-trips losslessly.

---

## F1 — Pronunciation lab (S2 generalized to all languages)

### Goal
Two honest mirrors: **A/B replay** (your voice against the native render —
the ear-trainer, valuable even with no score) and **syllable-level scoring**
where it can be trusted. Mandarin is the priority case (the free recognizer
forgives tone errors; fossilization risk is real — plan §10).

### Recording (turns the dormant contract ON)
Attempt audio recorded at 16 kHz mono in: teacher-chat voice answers,
conversation learner turns, deck attempts, and checkpoint cues. Rolling
window: 30 days AND max 1,000 clips (≈250 MB ceiling) — oldest pruned
first, daily. Recording failures are silent no-ops (never block speech).
Privacy stance unchanged: clips never leave the device except to the
scoring API below, and only when scoring is invoked.

### Scoring engine
Azure Speech Pronunciation Assessment, scripted mode (reference text always
known), per-language locale. zh-CN at `Phoneme` granularity → syllable-level
accuracy as the tone signal (Azure's prosody score is en-US-only — known
limitation, designed around). Other languages: word-level accuracy.

**Calibration spike gates scores per language** (unchanged from S2): native
renders + owner-correct + owner-deliberately-wrong through the API; scores
ship only if wrong-tone/wrong-sound syllables separate cleanly (≥ 20 points);
thresholds recorded in config. Fails → that language ships A/B replay only.

### Where it fires (owner policy, 2026-06-12)
1. **Mandarin: automatically** on every newly taught word's echo (1–3 s
   clips, cheap, catches errors at formation) + tone gym drills.
2. **All languages: on demand** — "check my pronunciation" on any attempt
   sheet / mastery-map word, and one slot in the weekly checkpoint.
3. Assessment always runs **async after** the local verdict; a slow or
   failed call changes nothing about the lesson flow.

### Feedback design (unchanged from S2, now per-language)
Pinyin-with-tone-marks (zh) or the word (others), colored by calibrated
band; ONE spoken correction line targeting the worst syllable, teacher
voice, target-language word inside «marks»; A/B toggle front and center.

### Cost & acceptance
~$1–5/month at realistic zh usage, metered as `azure:pron_assess`.
Accept: calibration recorded; deliberate *mǎ/mà* swap shows visibly
different bands; A/B replay works for id/es/fr too; lessons never block;
every call metered. Degrade: no Azure key → A/B replay only, no nag.

---

## F2 — Story mode (extensive listening)

### Goal
The MT method maximizes production but starves input. Stories fix that:
serialized 60–120 s audio episodes in the target language, generated
**inside the mastery whitelist** + current protocol structures, rendered
once, cached forever, replayed free. Native pace — this is where the ear
earns conversation mode's speed.

### Why serialized
A recurring cast and setting per language (e.g., id: a warung family in
Denpasar) makes episode N+1 cheaper to follow than a cold story — known
names, known places — and gives a reason to come back. Episode state is
one paragraph of "story so far" carried in the generation prompt.

### Flow
1. Episode card: title, ≤ 3 new words shown with English gloss text and
   per-word play buttons at **teaching pace** (the only preview).
2. Listen: full episode, native pace, teacher voice narration + persona
   voices for dialogue lines (F4 cast). Audio is 100% target language —
   the no-spoken-English rule is absolute; glosses are text on screen.
3. One comprehension beat after (not a quiz): the teacher asks ONE spoken
   question in the target language; answer by voice; generous LLM judging;
   or tap "just listening today" — skipping costs nothing.
4. Transcript available after listening (tap to reveal, «marked», so any
   line can be replayed at teaching pace) — listen-first, read-after.

### Generation pipeline
Sonnet writes the episode (whitelist + ≤ 3 new words + protocol-week
structures + story-so-far + register notes); same out-of-vocabulary guard
as S1 (tokenize w/ affix folding, one re-ask, else on-screen gloss +
debrief). New words enter recycling as provisional items (the S1
`conv_extract` path, reused). ElevenLabs renders narration + dialogue
lines per speaker; clips cached under content-hash keys.

### Background / lock-screen listening
Desirable, but the ONE-audio-session rule outranks it: investigate
`expo-audio` background playback **within the existing playAndRecord
config**; if it demands a category flip, stories stay foreground with the
walking-mode dim. This is an investigation gate, not a promise.

### Data model
```
story(id PK, language, episode_no, title, text_marked, summary_so_far,
      new_words_json, audio_keys_json, created_at, listens INT)
```

### Cost & acceptance
Per episode: one Sonnet call (~$0.01–0.03) + one render (~900–1,800 chars,
$0.30–0.60 ElevenLabs) — one-time; replays free. A few episodes/week ≈
**$1–3/month**, metered as `anthropic:story` + the TTS unit.
Accept: an episode generates inside the whitelist (guard trip-rate logged),
plays end-to-end in target language only, comprehension beat answers by
voice, replay is instant and free, new words appear in recycling and in
the next teacher lesson.

---

## F3 — Live capture (life feeds the curriculum)

### Goal
The owner lives inside the language. When a phrase lands in earshot —
warung, driver, landlady — capture it in five seconds and let the app
fold it into the curriculum. Real life becomes the content pipeline.

### Flow
1. Capture button on Home (and, platform permitting, an iOS Action
   Button/widget entry — investigate, don't promise). Two modes on the
   sheet, one tap apart: **"I heard…"** (STT in target locale) and
   **"How do I say…"** (STT in English locale). Explicit mode beats
   recognizer guessing.
2. Haiku explains in one short card: meaning, register note (is this the
   casual form?), one original example — target spans «marked», playable
   at teaching pace.
3. Saved + queued: a provisional mastery item via the existing
   `chat:<lang>:<word>` identity path; the teacher-prompt adapter gains a
   "recent captures" section (≤ 5, newest first) so the next lesson works
   them in naturally; the suggestion chip surfaces unworked captures (§1.2).

### Data model
```
capture(id PK, language, mode TEXT heard|say, raw_text, explanation_marked,
        item_id, status TEXT new|woven|dismissed, created_at)
```

### Cost & acceptance
One Haiku call per capture (≈ $0.001) + optional TTS plays — negligible,
metered. Accept: capture → explanation in ≤ 5 s online; offline capture
queues and explains later; a captured word demonstrably appears in the
next teacher session and in recycling. Degrade: offline = stored raw with
a "will explain when online" note.

---

## F4 — Persona voices (the cast)

Conversation partners and story characters stop sharing the teacher's
voice. Per language, a curated cast of 2–3 additional ElevenLabs voice ids
(shipped defaults; owner can re-audition in Settings). Scenario definitions
gain `voice: <cast-member>`; story dialogue lines carry a speaker tag.

Rules: the teacher voice is reserved for the teacher (lessons, debriefs,
reviews, story narration). `ttsToFile` gains an optional `voiceId` —
already part of the cache key by construction. Debrief stays teacher-voiced.
Same per-character cost; cache per voice. No new screens.

Accept: two scenarios play with audibly different partners; the teacher
still sounds like the teacher everywhere; switching a cast voice in
Settings re-renders only future lines (cache keys differ).

---

## F5 — Mastery map ("what I own")

One view-only screen (the screen-count exception is earned: this is the
mirror the whole app writes into). Per language:

1. **Header:** protocol position — "Month 2 · Week 6 — past tense" — plus
   the speakable-sentences counter.
2. **Words:** mastery whitelist grouped by theme/recency, strength shown
   as dots (no red, ever). Tap a word → sheet: hear it (teaching pace),
   its stored example sentence, its history (first met, last reviewed,
   A/B replay if a clip exists in the F1 archive), and **"drill this"** →
   queues it for the next session.
3. **Structures:** protocol milestones unlocked ("can negate three ways",
   "can talk about yesterday") — derived from protocol position, written
   as abilities, not grammar jargon.

Implementation: pure SQLite reads + the existing counter lib; zero API
calls; digest extraction gains one optional field (`example` per taught
item) so chat-taught words carry a context sentence. Accept: every word
the schedule knows is findable, hearable, drillable; counter matches the
weekly review's number; screen works fully offline.

---

## Out of scope (final app — unchanged and re-affirmed)

Accounts, sync, analytics, social, streaks/XP/leagues, payments, app-store
release, reading/writing instruction (hanzi/kana/katakana stay
recognition-only inside protocols), languages beyond the six.

---

## Cost picture, steady state (all modules, 1–2 active languages)

| Module | Cadence | Estimate |
|---|---|---|
| Teacher chat (Sonnet, cached) | daily | $3–10/mo |
| Conversation mode (Haiku + ElevenLabs) | daily | $1–4/mo |
| Story mode | few episodes/week | $1–3/mo |
| Pronunciation lab | zh active | $1–5/mo |
| Live capture | ad hoc | < $0.50/mo |
| Reviews/digests/notifications | weekly/bg | < $1/mo |
| **Total** | | **~$7–24/month** |

The meter, not this table, is the truth. Pack renders and protocol
authoring stay one-time, front-loaded costs per the owner's plan.

## Build order (after the first TestFlight build)

F0 completions → F3 capture (smallest, daily value, exercises the spine) →
F4 voices → F1 lab (gates on Mandarin arriving + calibration spike) →
F2 stories → F5 map. Each lands as its own reviewed commit; each is
individually shippable; none may regress the voice-runtime architecture.
