# Kataku — Stretch Spec (S1–S3)
### Conversation mode · Mandarin tone scoring · Builder thematic packs

Companion to `plan.md`. These features are **specced now, built after v1 (M0–M5)** — the spec exists so v1's architecture leaves the right doors open and so the owner's one-month cost test can include S1 in its back half. Nothing here may delay or complicate M0–M4.

**v1 hooks these depend on** (all already in plan.md, restated as a contract):
1. STT behind a single `SpeechRecognizer` interface (S1 reuses it; S2 adds a parallel assessment path).
2. Attempt audio recorded and retained rolling 30 days, 16 kHz mono (S2 sends these clips; weekly review replays them).
3. `mastery` table queryable as a vocabulary whitelist with strength scores (S1's constraint source; S3's unlock condition).
4. All paid calls through the cost-meter wrapper (Section 4.4 of plan.md) — no exceptions.
5. Every stretch feature degrades gracefully: API down or cap reached → skip with a spoken notice, never block a session.

**Recommended build order:** S1 immediately after Indonesian Foundation is complete (~week 3 of the owner's test month — it is the retention feature for that phase) → S3 pack 1 alongside S1 (scenarios need themes) → S2 when Mandarin begins (likely month 2).

---

## S1 — Conversation mode

### Goal
Free-form spoken dialogue in the target language, constrained to what the learner has actually mastered — the "graduation" experience the Foundation phase builds toward. The learner should walk away from a 10-minute conversation having *used* the language, not been quizzed on it.

### Unlock
Per language: Foundation complete (day 14 core done) **or** mastery strength ≥ 3 on ≥ 80% of Foundation blocks. Surfaced on Home as a third button once unlocked: "Have a conversation."

### UX flow
1. Pick a scenario (from S3 packs + three generic starters that ship with S1: *introducing yourself*, *plans for today*, *what you did yesterday*) and a mood: **gentle** (partner leads, short answers fine) or **normal** (partner expects fuller sentences).
2. Conversation runs 5–15 minutes, fully spoken: partner speaks → learner replies (same think-window + mic mechanics as lessons) → partner responds. Big end button; works in walking mode.
3. **Debrief** (60–90 seconds, spoken + on screen): two or three patterns worth tightening, each demonstrated correctly; those items are auto-queued into the recycling scheduler; one genuine, specific compliment if earned ("you handled the past tense without hesitating").

### Constrained generation
Each session assembles one system prompt containing:
- Persona + scenario goal + success condition (from the scenario definition, S3).
- The **vocabulary whitelist**: all mastered items' `target_text` plus the grammar templates the learner knows.
- Style rules: replies ≤ 2 short sentences; one question at a time; natural register (see S3 register notes); never switch to English except single-word glosses for the new-word allowance.
- **New-word allowance:** at most 2 new words per session, and each must be introduced Michel Thomas–style in the flow ("*pasar* — that's the market — *pasar*"), then logged to `conv_extract` so they enter the recycling pool as provisional items.
- **Correction policy: recast, don't interrupt.** If the learner says *saya pergi pasar kemarin*, the partner replies naturally with the corrected form embedded ("Oh, kamu pergi **ke** pasar kemarin? Beli apa?") and tags the error internally for the debrief. No mid-conversation lectures.

### Out-of-vocabulary guard
Post-process every partner reply against the whitelist before playing it: tokenize (Indonesian: crude affix folding — strip me-/di-/ber-/-kan/-nya before lookup; Mandarin: dictionary-based segmentation, e.g., jieba wordlist bundled); if unknown tokens exceed the allowance, re-ask the model once to simplify; if it still fails, play it but flag the words on screen and add them to the debrief. Log guard trip-rate — if a scenario trips constantly, its prompt needs tightening.

### Pipeline and latency
Native STT (free, existing interface) → LLM turn → TTS → play.
- **Partner voice:** default is the device TTS voice (free). Optional setting: runtime premium voice using the pack's bake-off winner if its API supports request-time synthesis (~$0.01–0.06 per minute of partner speech). Worth enabling for Mandarin, where tone-correct input matters even in conversation.
- **Latency budget:** ≤ 2.5 s from end-of-learner-speech to first partner audio. Achieved by short replies, streaming TTS where the provider supports it, and pre-warming the next turn while the learner speaks. If a turn exceeds ~4 s, play a natural filler from a small pre-rendered set ("Hmm…", "Oh ya?") rather than dead air.

### Data model additions
```
conversation(id PK, language, scenario_id, mood, started_at, ended_at, turns INT, cost_usd)
conv_turn(id PK, conversation_id, idx, role TEXT partner|learner, text, audio_ref, errors_json)
conv_extract(id PK, conversation_id, kind TEXT new_word|error_pattern, payload_json, queued_item_id)
```

### Cost model
LLM: a 10-minute conversation is ~20–30 short turns ≈ a few thousand tokens with the whitelist prompt ≈ **$0.01–0.05/session** on a small model. TTS: $0 (device voice) or ~$0.02–0.15/session (premium runtime). Daily use lands at **~$1–4/month**, all metered.

### Acceptance
A full 10+ turn spoken Indonesian conversation completes using only mastered vocabulary plus ≤ 2 flagged new words; recasts appear in partner replies where the learner erred; the debrief queues at least one item into recycling; latency budget met on ≥ 90% of turns; session cost visible in the meter immediately after.

### Risks
Model drifts beyond the whitelist (guard + retry above; tighten scenario prompts from trip-rate data). Latency breaks immersion (short replies, fillers, streaming). Learner freezes (gentle mood exists precisely for this; partner falls back to either/or questions when the learner stalls twice).

---

## S2 — Mandarin tone scoring

### Why this exists
The free recognizer is an *intelligibility* judge, and Mandarin STT uses context to forgive tone errors — a learner can say the wrong tone and still get a "pass" because the sentence was inferable. Fine for fluency, dangerous for fossilization. Tone scoring is a second, parallel judge that listens only to *how* syllables were said.

### Engine
**Azure Speech Pronunciation Assessment**, scripted mode (we always know the reference text), locale `zh-CN`, granularity set to `Phoneme` so results include **syllable-level accuracy scores** (zh-CN additionally returns phoneme names in SAPI format). Score at the **syllable level** as the primary signal. Two honest limitations to design around: Azure's prosody score is en-US-only, so tone quality must be read from syllable/phoneme accuracy rather than a dedicated tone field; and phoneme-level scores have been observed to flatten across a word, which is why syllable granularity plus the calibration spike below are mandatory before trusting thresholds.

### Calibration spike (gates the feature)
Before wiring any UI: run (a) the pack's native TTS renders, (b) the owner saying words correctly, and (c) the owner *deliberately* using wrong tones, through the API. The feature ships only if syllable scores cleanly separate (a)+(b) from (c) — e.g., wrong-tone syllables score ≥ 20 points lower on average. Record the thresholds found into config. If separation fails, document it and fall back to ear-training only (A/B replay, below) rather than showing unreliable scores.

### Where it fires
1. **Echo step of every new Mandarin word** — clips are 1–3 s, so this is cheap and catches errors at the moment of formation.
2. **"Check my tones" button** on any Mandarin prompt, on demand.
3. **Weekly checkpoint** for Mandarin gains a tone sub-score.
4. **Tone gym (optional, 2 min/day):** authored drill content in the zh pack — tone pairs, third-tone sandhi, the 一/不 tone changes — run through the same scoring.

### Feedback design
- Pinyin with tone marks per syllable, colored by band: ≥ 85 good · 60–84 close · < 60 off (bands re-anchored by the calibration spike).
- One spoken line targeting the worst syllable, from templates: "Second syllable — it's the falling tone: **hào**. Listen again." Never more than one correction per attempt.
- **A/B replay:** instant toggle between *your* recording and the native render of the same word. This is the highest-value element even if scores were unavailable — the contrast trains the ear.
- Audio path: reuse the existing attempt-recording pipeline (16 kHz mono WAV) with a gain check before sending; run the assessment **async after** the local pass/near/miss verdict so lessons never block on the network.

### Cost
Billed in Azure's STT-style per-audio-time pricing class (verify the current rate and free-tier hours at build time; standard speech transcription has been around $0.017/min, and pronunciation assessment bills in the same family). Realistic usage — new-word echoes plus tone gym ≈ 3–6 minutes of scored audio/day — lands at **~$1–5/month**, metered.

### Acceptance
Calibration spike passes and thresholds are recorded; a deliberately wrong-tone *mǎ/mà* pair shows visibly different syllable colors; worst-syllable spoken feedback plays; A/B replay works; lesson flow is never blocked by a slow or failed assessment call; every call appears in the cost meter.

---

## S3 — Builder thematic packs

### Model
A pack is a theme. Same content schema as Foundation (`phase: "builder"`), 8–12 lessons, **~30–50 new blocks that constantly recombine with all Foundation blocks** — the point of Builder is depth through recombination, not vocabulary dumping. Pack manifest: `{id, language, title, requires: ["foundation"], version}`.

### Schema additions (apply to the shared schema in plan.md §5.1)
- `item.register`: `"neutral" | "casual" | "formal"` (default neutral).
- Pack-level **sentence templates** feeding the speakable-sentences counter, so finishing a pack visibly explodes the number.
- **Scenario definitions** for S1: `{id, persona, goal, opening_line, success_condition, register}` — minimum two per pack.

### Indonesian register strategy
Foundation teaches neutral-polite (*saya*, standard forms). Builder explicitly introduces the everyday register the owner actually hears in Bali — *aku*, *nggak*, *gimana*, particles like *dong/sih/kok* — every such item tagged `casual`, taught as "here's how people actually say it," with prompts defaulting to the everyday register (a settings switch flips prompts to formal for situations that need it). The owner street-tests every unit; anything that sounds textbook-stiff gets rewritten before rendering.

### Indonesian pack list (priority order, Bali-practical)
1. **Warung & food** — ordering, preferences, asking what something is, *pedas* negotiations.
2. **Getting around** — Gojek/Grab, directions, prices, "wait here."
3. **Market & bargaining** — numbers fluency under pressure, quantities, polite refusal.
4. **Small talk** — where you're from, family, how long in Bali, weather; the neighbor-and-warung-aunty conversational loop.
5. **Home & landlord** — things breaking, asking for help, scheduling.
6. **Plans & opinions** — inviting, declining, preferring, because/so/but chains.

### Mandarin Builder notes (for when it starts)
Measure words enter here (counting patterns consolidated before variety); 了 introduced as usage patterns, not grammar lecture; pinyin remains displayed throughout Builder; tone gym (S2) runs alongside.

### Unlock and flow
A pack unlocks when Foundation is complete; multiple packs can be active concurrently; the recycling pool is **shared across packs**, so warung vocabulary resurfaces inside transport sentences and vice versa. "Today's session" interleaves active packs rather than running them serially.

### Authoring checklist (extends plan.md §5.2)
Every new block used in ≥ 4 prompts across the pack · register tagged on every item · ≥ 2 scenarios defined · sentence templates added to the counter · owner street-test sign-off before rendering.

### Acceptance
Pack 1 (Warung & food) playable end-to-end; speakable-sentences counter jumps on pack mastery; at least one S1 scenario draws exclusively on the pack + Foundation vocabulary; recycled Foundation items appear inside pack prompts.

---

## Cost picture once everything is live

| Feature | Cadence | Estimate |
|---|---|---|
| S1 conversations (daily) | Monthly | ~$1–4 |
| S2 tone scoring (Mandarin active) | Monthly | ~$1–5 |
| S3 packs (content renders) | One-time per pack | ~$0–8 each (smaller than Foundation) |
| Existing v1 costs (coach, fallback STT) | Monthly | ~$1–4 |

All-in steady state with every feature on and two languages active: **~$3–13/month** — and the cost meter, not this table, is the source of truth. For the owner's one-month test: month one is Indonesian-only, so expect the v1 costs plus S1 from week 3; S2 joins the bill when Mandarin begins.
