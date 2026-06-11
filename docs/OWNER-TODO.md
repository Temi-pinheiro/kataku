# Owner TODO — everything that needs *you*

Updated 2026-06-11 after the owner's M0 device run. M0 is done
(`docs/m0-findings.md`); device-TTS fallback judged unusable as the tutor
voice, so **rendered audio is the critical path**. Apple Developer account:
owner already has one — say "set up TestFlight" in a session when ready.

## 1. API keys → `.env` at the repo root (gitignored; never committed)

Walkthrough is in the session notes / below. Minimum to unblock everything:
OpenAI. Azure + ElevenLabs only if you want them in the bake-off.

```
OPENAI_API_KEY=sk-...
AZURE_SPEECH_KEY=...             # optional bake-off candidate (F0 tier: 500k chars/mo free)
AZURE_SPEECH_REGION=southeastasia
ELEVENLABS_API_KEY=...           # optional bake-off candidate (free tier ~10k chars/mo)
ELEVENLABS_VOICE_ID=...          # pick a multilingual voice in their Voice Library first
```

- **OpenAI**: platform.openai.com → sign in → Settings → API keys →
  "Create new secret key". Needs a payment method / a few dollars of credit
  (Settings → Billing). The render of all three packs is well under $2.
- **Azure**: portal.azure.com → free account if you don't have one →
  "Create a resource" → search **Speech** (Azure AI services) → create with
  the **Free F0** tier, region `southeastasia` → once deployed, "Keys and
  Endpoint" has KEY 1 + region. F0 = 500k chars/month free, enough to render
  every pack for $0 — worth the 10 minutes even beyond the bake-off.
- **ElevenLabs**: elevenlabs.io → sign up (free tier) → click your profile →
  API Keys → create. Then Voices → Voice Library → search a multilingual
  voice you like (audition Indonesian text in the preview) → add it →
  copy its **voice ID** into `ELEVENLABS_VOICE_ID`.
- **Google (Chirp 3 HD)**: adapter is stubbed — needs a GCP project +
  service account. Say "wire up Google TTS" in a session if you want a
  4th bake-off voice; otherwise 3 candidates is a fine audition.

## 2. Bake-off (blind), then render all three packs

```bash
npm run render-audio -- --bakeoff
# → content/bakeoff/: samples named id-answer-1--A.mp3 etc.
#   Letters are shuffled per provider. DON'T open key.json until you've picked.
# Listen, pick the best letter for Indonesian (and zh for later), then:
cat content/bakeoff/key.json        # reveal which provider each letter was
# Set the winner in VOICES at the top of scripts/render-audio.ts, then:
npm run render-audio -- --lang id
npm run render-audio -- --lang es
npm run render-audio -- --lang fr
npm run validate-content -- --require-audio
```

Each render finishes by regenerating `src/generated/audio-map.<lang>.ts`,
which bundles the clips into the next app build — then rebuild on the phone:

```bash
npx expo run:ios --device
```

The robotic voice problem disappears at this step: every teach line, answer,
and slow answer plays the rendered voice; device TTS remains only as a
fallback for unrendered/dynamic lines.

## 3. Review content before/while rendering (you are the editor — plan §5.2)

- `content/id/foundation.json` — street-test in Bali (pulang, pasar,
  Sudah/Belum answers, neutral register).
- `content/es/foundation.json`, `content/fr/foundation.json` — you can judge
  these directly; they're also your app-quality baselines. Deliberate
  choices: Spanish is pro-drop (yo/tú accepted as variants, never required);
  French canonical keeps `ne` with the street ne-drop accepted everywhere;
  futures are voy a / je vais scaffolds; no Romance past tense in Week 1.
- Edit freely → bump the pack's `"version"` → `npm run validate-content` →
  re-render (hash manifest = only changed lines re-render).

## 4. Later milestones that will ask you again

- **TestFlight/EAS setup** — whenever you say go (account exists).
- **M3:** daily notification opt-in (time preference, default 8am).
- **M4:** Anthropic API key for the Tier-1 coach (~$1–2/mo, plan §11).
- **M5:** Mandarin + Italian packs; zh bake-off listen; fr-FR recognition
  quality risk from M0 findings needs a real look before French is primary.
