# Owner TODO — everything that needs *you*

Everything Claude could do alone is done and committed (see README for
state of play). These items need your phone, your ears, your accounts, or
your judgment — roughly in order.

## 1. Run M0 on your iPhone (no account or key needed)

```bash
npm install
npx expo run:ios --device        # free personal-team signing is fine for the spike
```

- Plug in the iPhone, pick it as the target, accept the signing prompts in
  Xcode if asked (free Apple ID works; app expires after 7 days — fine for M0).
- On the phone: Home → **Mic test** → run the id-ID / zh-CN / fr-FR trials
  and fill in `docs/m0-findings.md`.
- Then try a real lesson: **Start today's session**. The whole Week 1 course
  already runs end-to-end using the device's built-in voices (no audio pack,
  no API key, $0). Expect robotic-but-functional audio until step 4.

## 2. Decide: Apple Developer account ($99/yr)

Plan §6 recommends it (TestFlight, 90-day builds, no laptop ritual). The
free signing path forces a weekly Mac re-sign — acceptable only while M0 is
being validated. When you've decided, say so in a session and EAS/TestFlight
setup gets wired up.

## 3. API keys → `.env` (gitignored; never committed)

```
OPENAI_API_KEY=sk-...            # TTS rendering now; cloud STT fallback + coach later
AZURE_SPEECH_KEY=...             # optional, bake-off candidate (500k chars/mo free)
AZURE_SPEECH_REGION=southeastasia
ELEVENLABS_API_KEY=...           # optional, bake-off candidate
ELEVENLABS_VOICE_ID=...          # pick a multilingual voice id in their UI first
```

Google (Chirp 3 HD) needs a GCP project + auth — its adapter is stubbed; if
you want it in the bake-off, say so in a session and it gets implemented.

## 4. Voice bake-off, then render Week 1 (~$1–3 one-time on OpenAI; $0 on Azure free tier)

```bash
npm run render-audio -- --bakeoff      # renders the sample through every provider you have keys for
# listen blind in content/bakeoff/, pick a winner per language
# set the winner in VOICES at the top of scripts/render-audio.ts
npm run render-audio -- --lang id --dry-run   # sanity check: 324 clips
npm run render-audio -- --lang id             # the real render
npm run validate-content -- --require-audio   # everything has a file
```

Note: getting rendered audio onto the phone (pack download/copy flow) is the
one M2 piece deliberately deferred until audio actually exists — the app
plays device-TTS fallback meanwhile. Say "wire up pack install" in a session
once the render is done.

## 5. Review Week 1 content (you are the editor — plan §5.2)

Read `content/id/foundation.json` (cues, expected variants, teach scripts)
with your Bali ears. Things chosen deliberately, flag if they feel wrong:
- *pulang* taught instead of "pergi ke rumah"; *pasar* as the first place noun
- neutral register (saya/tidak); *aku* accepted as a variant, never taught
- lesson 6 teaches answering sudah-questions with *Sudah/Belum*, not *ya*
- Edit freely, bump `"version"`, then `npm run validate-content`. Re-render
  only re-renders changed lines (hash manifest).

## 6. Later milestones that will ask you again

- **M3:** daily notification opt-in (time preference, default 8am).
- **M4:** Anthropic API key for the Tier-1 coach (on by default per plan §11,
  ~$1–2/mo) — same `.env` + on-device secure storage.
- **M5:** four more language packs → four more bake-off listens.
