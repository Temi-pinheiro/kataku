# Stories — catalog & scope

Stories is passive immersion: produced audio episodes (60–120 s) with a
synced bilingual read-along transcript. Leveled, gated by **protocol
position** (never by streak or payment). One recurring cast and setting
per language so episode N+1 is easier to follow than a cold start.

## Scope at a glance

**Six episodes per language × six languages = 36 stories**, across three
levels that track the 6-month protocol arc:

| Level | Unlocks at | Count | Vocabulary basis |
|---|---|---|---|
| Beginner | crash course done (≈ Month 1) | 3 | crash-course words, recombined; ≤ 3 new/episode |
| Intermediate | ≈ Month 3 | 2 | + past/aspect, richer connectors |
| Advanced | ≈ Month 5 | 1 | culturally textured, natural pace |

The same six **scene archetypes** run across all languages (so the
catalog is comparable), each localized to that culture:

| # | Archetype | Level | id (Bali) | es | fr | it |
|---|---|---|---|---|---|---|
| 1 | Arrival / a trip | Beg | Liburan ke Bali | Un viaje a la costa | Un voyage en Provence | Un viaggio in Toscana |
| 2 | Market / bargaining | Beg | Di Pasar Tradisional | En el mercado | Au marché | Al mercato |
| 3 | Café / ordering food | Beg | Di Warung Kopi | En el café | À la boulangerie | Al bar |
| 4 | Finding your way | Int | Mencari Alamat | Buscando la calle | Trouver le chemin | Cercando la via |
| 5 | Meeting people / a meal | Int | Makan Malam Bersama | Una cena con amigos | Un dîner ensemble | Una cena in famiglia |
| 6 | A small problem, resolved | Adv | Kunci yang Hilang | La llave perdida | La clé perdue | La chiave smarrita |

(Titles are working drafts — finalized when scripts are written.)

## Recurring cast (per language, drafted with scripts)

A small ensemble that reappears across the six episodes — e.g. for
Indonesian: a warung family in Denpasar (Bu Sari, her son Wayan, a
regular customer). Continuity gives a reason to come back and makes new
episodes cheaper to follow. Each language gets its own localized cast.

## What ships now (all scripted) + the listening ladder

**24 stories, every one scripted and playable** (src/content/stories.ts) —
no locked placeholders. Audio is still **rendered + embedded manually**
(owner reviews script → manual ElevenLabs render → manual embed); until a
produced track exists, the player speaks each line with the runtime voice.

- **Per non-Indonesian language (es/fr/it/zh/ja): 3** — arrival (Beg),
  market (Int), a small problem (Adv).
- **Indonesian: 9**, including a **listening ladder** (owner request,
  2026-06-13) — progressively longer episodes to harden the ear:
  - *Pagi yang Cerah* (Beginner, ~10 lines)
  - *Naik Ojek* (Beginner, ~10 lines)
  - *Hari di Pasar* (Intermediate, ~14 lines)
  - *Cerita dari Desa* (Advanced, ~18 lines — the lengthiest listen)

- **Optional later expansion:** extend each non-Indonesian language from 3
  toward the full 6-archetype set (café, directions, shared meal), and add
  listening ladders in the other languages if wanted.

## Production pipeline (manual render/embed by owner choice)

1. **Author** the script (original; whitelist-constrained; ≤ 3 new words
   introduced in flow) → `content/stories/<lang>/<id>.json`.
2. **Owner reviews** the script (same gate as packs — nothing renders
   unread).
3. **Render** narration + per-character dialogue lines (ElevenLabs cast)
   → cached by content hash, like the packs. *Manual step.*
4. **Embed** audio keys → the app picks them up. *Manual step.*
5. **Illustrations** (owner-commissioned, warm/painterly, scene-specific)
   drop in as `thumb` (≥144²) + `hero` (~750×380); gradient placeholders
   until then.

## Cost (manual, owner-gated)

Per episode: one Sonnet authoring call (~$0.01–0.03) + one render
(~900–1,800 chars, ~$0.30–0.60 ElevenLabs) — one-time; replays are free.
36 episodes fully rendered ≈ a one-time **$12–22**, spent only as the
owner approves each render. No per-listen cost.
