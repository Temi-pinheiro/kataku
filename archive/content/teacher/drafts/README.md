# Teacher protocol drafts — review copies

These six files are **review drafts**, not live protocols. They answer the same owner
prompt ("the Michel Thomas method as a 6-month structure, weeks 1–2 as a crash
course") once per language, with a shared skeleton so they can be compared side by
side:

- `spanish-protocol.md`
- `french-protocol.md`
- `indonesian-protocol.md`
- `italian-protocol.md`
- `mandarin-protocol.md`
- `japanese-protocol.md`

Each is a **standalone document**: paste it into a fresh LLM chat and say "be my
teacher, follow this protocol." No Kataku app mechanics are baked in. Method
principles only — all example sentences and sequences are original (plan §5.3).

## Promotion path

1. Owner reviews a draft (structure, examples, language-specific calls).
2. Copy/replace it into `content/teacher/<language>-protocol.md`.
3. Run `npm run embed-protocols` to regenerate `src/generated/teacher-protocols.ts`.

Currently only **id / es / fr** are wired into the app. The **it / zh / ja** drafts
sit here until those languages land, then get wired the same way.
