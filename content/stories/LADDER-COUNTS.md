# Listening ladders — character counts (for ElevenLabs)

16 graduated read-along stories (4 rungs × 4 Latin-script languages) authored
in `src/content/story-ladders.ts` (`LADDER_STORIES`). Each rung is longer than
the last, to harden the learner's listening endurance:

| Rung | Level | Target listen |
|---|---|---|
| 1 | Beginner | ~2 min |
| 2 | Beginner | ~4 min |
| 3 | Intermediate | ~6 min |
| 4 | Advanced | ~8 min |

**Character counts below are the exact sum of the spoken `target` text** per
story — the figure that drives ElevenLabs cost. English glosses are shown,
never spoken, and are excluded from the counts.

`audioBase` is `null` for every story — these render manually, owner-gated,
exactly like the existing Stories pipeline.

---

## Indonesian (id) — subtotal 14,427

| id | title | level | lines | target chars |
|---|---|---|---|---|
| `id-ladder-1` | Pagi di Sanur | Beginner | 45 | 1,444 |
| `id-ladder-2` | Wayan dan Pasar Pagi | Beginner | 86 | 2,747 |
| `id-ladder-3` | Sore di Desa | Intermediate | 114 | 4,272 |
| `id-ladder-4` | Cerita Kakek tentang Laut | Advanced | 154 | 5,964 |
| | | | **subtotal** | **14,427** |

## Spanish (es) — subtotal 14,341

| id | title | level | lines | target chars |
|---|---|---|---|---|
| `es-ladder-1` | Una mañana en el pueblo | Beginner | 42 | 1,369 |
| `es-ladder-2` | El mercado del sábado | Beginner | 82 | 2,747 |
| `es-ladder-3` | La tarde en casa de la abuela | Intermediate | 116 | 4,267 |
| `es-ladder-4` | La historia del viejo reloj | Advanced | 152 | 5,958 |
| | | | **subtotal** | **14,341** |

## French (fr) — subtotal 14,415

| id | title | level | lines | target chars |
|---|---|---|---|---|
| `fr-ladder-1` | Un matin à la campagne | Beginner | 38 | 1,362 |
| `fr-ladder-2` | Le marché du dimanche | Beginner | 73 | 2,726 |
| `fr-ladder-3` | L'après-midi chez grand-mère | Intermediate | 102 | 4,302 |
| `fr-ladder-4` | L'histoire de la vieille horloge | Advanced | 133 | 6,025 |
| | | | **subtotal** | **14,415** |

## Italian (it) — subtotal 14,374

| id | title | level | lines | target chars |
|---|---|---|---|---|
| `it-ladder-1` | Una mattina in paese | Beginner | 42 | 1,371 |
| `it-ladder-2` | Il mercato del sabato | Beginner | 86 | 2,751 |
| `it-ladder-3` | Il pomeriggio dalla nonna | Intermediate | 111 | 4,272 |
| `it-ladder-4` | La storia del vecchio orologio | Advanced | 149 | 5,980 |
| | | | **subtotal** | **14,374** |

---

## Per-language subtotals

| Language | Target chars |
|---|---|
| Indonesian (id) | 14,427 |
| Spanish (es) | 14,341 |
| French (fr) | 14,415 |
| Italian (it) | 14,374 |
| **Grand total** | **57,557** |

## Cost

At **$0.30 / 1,000 characters**, the full set of 16 ladder stories is:

> **57,557 chars × $0.30 / 1,000 = ~$17.27** (one-time render; replays are free)

Note: the real per-character rate depends on the ElevenLabs plan tier (higher
tiers bill fewer credits per character), so treat $17.27 as an upper-ish
estimate at the flat list rate. The four Latin-script languages are even
(~14k chars each).

Renders are owner-gated and incremental — render a language (or a single rung)
at a time as you approve each script; nothing renders until you do.
