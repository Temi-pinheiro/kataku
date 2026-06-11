# Kataku

Voice-first language learning for one person. The lesson happens through the
ears and mouth; the screen is a remote control. See `plan.md` (source of
truth), `stretch-spec.md`, and `content/SPEC.md`.

## State of play

| Milestone | Status |
|---|---|
| M0 de-risk | Code + Mic-test screen done; **needs the owner's iPhone** (`docs/m0-findings.md`) |
| M1 voice loop | Done — full cue→think→listen→evaluate→feedback loop, runs on device-TTS fallback with zero keys |
| M2 content pipeline | Validator + hash-keyed renderer + bake-off mode done; **needs keys + owner's ears**, then a pack-install flow |
| M3 sessions/progress | Engine + DB + Home done; notification scheduling pending |
| M4 review + coach | Review screen with speakable counter + honest stats done; spoken checkpoint + Tier-1 coach pending |
| M5 five languages | Indonesian Week 1 authored (lessons 8–14 outlined); other languages pending |

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
