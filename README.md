# Kataku

Voice-first language learning for one person. The lesson happens through the
ears and mouth; the screen is a remote control. See `plan.md` (source of
truth), `stretch-spec.md`, and `content/SPEC.md`.

## State of play

| Milestone | Status |
|---|---|
| M0 de-risk | **Done** — owner-tested on iPhone (`docs/m0-findings.md`); id-ID workable, device-TTS fallback judged unusable → rendered audio is the critical path |
| M1 voice loop | Done — full cue→think→listen→evaluate→feedback loop |
| M2 content pipeline | Validator + hash-keyed renderer + blind bake-off + bundled audio maps done; **needs keys + owner's ears** (`docs/OWNER-TODO.md`) |
| M3 sessions/progress | Engine + DB + Home with language switcher done; notification scheduling pending |
| M4 review + coach | Review screen (per language) with speakable counter + honest stats done; spoken checkpoint + Tier-1 coach pending |
| M5 five languages | **id + es + fr Week 1 authored** (~96 prompts each, validator-clean); zh + it pending |

**Next action: `docs/OWNER-TODO.md`.**

## Commands

```bash
npm start                      # Expo dev server
npx expo run:ios --device      # build to a plugged-in iPhone
npm test                       # vitest (pure logic in src/lib)
npm run typecheck
npm run validate-content       # content pack checks (0 errors required)
npm run render-audio -- --lang id [--dry-run]
npm run render-audio -- --bakeoff
```

## Architecture in one breath

Content is data (`content/<lang>/foundation.json` + rendered audio); the app
is a player. Pure logic (matching, scheduler, voice-loop reducer, session
builder, speakable counter, cost meter) lives in `src/lib` with no
react-native imports and full vitest coverage. Native edges (STT, audio,
SQLite) are wrapped in `src/services` and `src/db` behind small interfaces.
Five screens, no router, no backend, no accounts.
