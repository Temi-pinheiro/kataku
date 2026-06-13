# Listening ladders — character counts (for ElevenLabs)

24 graduated read-along stories (4 rungs × 6 languages) authored in
`src/content/story-ladders.ts` (`LADDER_STORIES`). Each rung is longer than
the last, to harden the learner's listening endurance:

| Rung | Level | Target listen |
|---|---|---|
| 1 | Beginner | ~2 min |
| 2 | Beginner | ~4 min |
| 3 | Intermediate | ~6 min |
| 4 | Advanced | ~8 min |

**Character counts below are the exact sum of the spoken `target` text** per
story — the figure that drives ElevenLabs cost. For **zh** the count is hanzi
(pinyin in `roman` is for the read-along, not voiced); for **ja** it is the
Japanese script (rōmaji in `roman` is not voiced). English glosses are shown,
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

## Mandarin (zh) — subtotal 5,217 (hanzi)

| id | title | level | lines | target chars (hanzi) |
|---|---|---|---|---|
| `zh-ladder-1` | 早上的茶 | Beginner | 57 | 513 |
| `zh-ladder-2` | 小李去买菜 | Beginner | 110 | 1,030 |
| `zh-ladder-3` | 奶奶家的下午 | Intermediate | 141 | 1,536 |
| `zh-ladder-4` | 老茶壶的故事 | Advanced | 186 | 2,138 |
| | | | **subtotal** | **5,217** |

## Japanese (ja) — subtotal 7,148

| id | title | level | lines | target chars |
|---|---|---|---|---|
| `ja-ladder-1` | 朝のコーヒー | Beginner | 51 | 685 |
| `ja-ladder-2` | ゆいさんの買い物 | Beginner | 107 | 1,445 |
| `ja-ladder-3` | おばあさんの家で | Intermediate | 133 | 2,127 |
| `ja-ladder-4` | 古い時計の話 | Advanced | 172 | 2,891 |
| | | | **subtotal** | **7,148** |

---

## Per-language subtotals

| Language | Target chars |
|---|---|
| Indonesian (id) | 14,427 |
| Spanish (es) | 14,341 |
| French (fr) | 14,415 |
| Italian (it) | 14,374 |
| Mandarin (zh) | 5,217 |
| Japanese (ja) | 7,148 |
| **Grand total** | **69,922** |

## Cost

At **$0.30 / 1,000 characters**, the full set of 24 ladder stories is:

> **69,922 chars × $0.30 / 1,000 = ~$20.98** (one-time render; replays are free)

Note: the real per-character rate depends on the ElevenLabs plan tier (higher
tiers bill fewer credits per character), so treat $20.98 as an upper-ish
estimate at the flat list rate. The Latin-script languages dominate the cost
(~14k chars each); zh/ja are far cheaper per story because the script is
compact (one hanzi/kana ≈ several Latin letters of speech).

Renders are owner-gated and incremental — render a language (or a single rung)
at a time as you approve each script; nothing renders until you do.
