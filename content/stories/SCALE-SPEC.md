# Stories at scale — the "epic" ladder (15–20 min) spec

A forward spec, not a build order. The shipping listening ladder is **2 / 4 /
6 / 8 min** per language (see `CATALOG.md` + `LADDER-COUNTS.md`). This document
specs a second, longer tier — **15–20 minute episodes** — so that if Kataku
grows (investors, a real user base, a content team), the production model,
costs, and architecture are already understood and nothing has to be
re-invented. Written 2026-06-13.

## Why a longer tier exists

Extended listening (10–20 min of connected, level-appropriate target-language
audio) is the single highest-leverage input activity past the survival stage —
it builds the parsing speed and stamina that short drills can't. It's also the
most defensible content moat: original, voiced, leveled long-form audio per
language is expensive to copy. The 6–8 min ladder proves the format; the
15–20 min tier is where it becomes a daily habit and a selling point.

## Shape

Per language, an **"epic" set** layered on top of the 6–8 min ladder:
- **3 episodes per language to start** — Intermediate (~12 min), Advanced
  (~16 min), Advanced+ (~20 min) — each a self-contained narrative with a
  recurring cast and setting (continuity across the language's whole library,
  so the epics feel like chapters, not strangers).
- Same read-along architecture: synced bilingual transcript, teal "line you're
  hearing now," English read never voiced, dual-script for zh/ja.
- **Serialized**: a `summary_so_far` carried per episode; later epics assume the
  vocabulary and characters of earlier ones (cheaper to follow, reason to
  return).

## Character & cost model (the number that matters)

Same per-minute character rates as the ladder estimate (Latin ~900 chars/min,
Mandarin ~300, Japanese ~420), at **$0.30 / 1,000 chars** (ceiling; real
ElevenLabs per-char rate is plan-dependent and usually lower).

| Tier | Latin chars/ep | zh chars/ep | ja chars/ep |
|---|---|---|---|
| ~12 min | ~10,800 | ~3,600 | ~5,040 |
| ~16 min | ~14,400 | ~4,800 | ~6,720 |
| ~20 min | ~18,000 | ~6,000 | ~8,400 |
| **3-ep set / language** | **~43,200** | **~14,400** | **~20,160** |

Per-language one-time voicing (3 epics):
- Indonesian / Spanish / French / Italian: **~43k chars ≈ $13 each**.
- Mandarin: ~14k ≈ **$4.3**. Japanese: ~20k ≈ **$6**.
- **All six, 3 epics each (18 episodes): ~227k chars ≈ $68** at $0.30/1k —
  one-time, replays free, paced one render at a time.

For a fuller library (say 6 epics/language, 36 episodes) double it: **~$135**
one-time across all six. Still a rounding error against the value of the moat,
and entirely gateable render-by-render.

## Production model (what a content team would run)

1. **Author** (LLM-drafted, human-reviewed): script to the character budget,
   level-checked against the protocol vocabulary, original. ~$0.02–0.05 of
   model time per episode.
2. **Review gate** (owner / editor): nothing renders unread — the standing rule.
3. **Render** (ElevenLabs, the one pack voice + persona voices for dialogue,
   F4): per-character cost above; cache by content hash like the packs.
4. **Karaoke timings**: with a produced single track, derive per-line
   timestamps (ElevenLabs character-level timestamps, or forced alignment) so
   the transcript syncs to real audio instead of the per-line runtime fallback.
5. **Illustration**: one hero per epic (commissioned, warm/painterly).

## Architecture readiness (already true today)

- The `Story` type + `StoryPlayerScreen` are length-agnostic — a 20-min episode
  is just more `lines`. No code change needed for length.
- Runtime-voice playback already covers any episode before its track is
  rendered, so epics are testable the day they're authored.
- Only two things the long tier will *want* that aren't built yet:
  **(a)** real karaoke timings from a produced track (today the active line is
  line-stepped, not audio-synced); **(b)** background/lock-screen audio so a
  20-min listen survives a screen-off walk — flagged in `final-spec.md` as an
  investigation gated by the one-audio-session rule.

## Not now

This tier is **not** in the current build. It ships only if/when scale justifies
the render spend and (ideally) a content editor. The 6–8 min ladder is the
proof; this doc is the blueprint for the day the answer is "go bigger."
