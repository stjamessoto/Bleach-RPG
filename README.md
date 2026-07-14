# Bleach: Ashes of the Soul

A turn-based, AI-narrated Bleach text RPG. React + Vite front end, with a tiny
Node proxy that lets an AI act as the live Game Master — tracking stats,
resource gauges, and canon-accurate combat while narrating in Tite Kubo's style.

**Powered by Google Gemini's free API tier** — no credit card, no expiration.

The GM has live access to the **Bleach Wiki** (bleach.fandom.com) via Gemini
function calling, so it looks up real canon (Kidō incantation numbers,
Zanpakutō/Espada/Arrancar abilities, Quincy and Hollow techniques, character
details) instead of guessing. Any pages it consults are cited under its reply
as small "📖 Canon: ..." links.

Any GM narrative can also be **illustrated on demand** in black-and-white
manga style via Hugging Face's free Inference API — click "🎨 Illustrate This
Scene" under a scene to generate art of it.

## What's inside

| File / folder | Role |
|---|---|
| `index.html`, `src/main.jsx`, `src/App.jsx` | App shell + routing between creation and gameplay |
| `src/components/CharacterCreator.jsx` | The Character Creation Suite (name, faction, hybrid, appearance, weapon) |
| `src/components/GameScreen.jsx` | Running game: transcript, input, turn loop |
| `src/components/HUD.jsx` | Visible stat + resource gauges |
| `src/data/factions.js` | Canon faction data, resource pools, hybrid gauges |
| `src/engine/systemPrompt.js` | The GM directive + live state injection |
| `src/engine/gameEngine.js` | Delta parser, state reducer, API client |
| `src/engine/saves.js` | Client for the save-slot API — list/load/create/update/delete |
| `src/components/SaveSelect.jsx` | Pick a saved character to continue, or start a new one |
| `server.js` | Zero-dependency Node proxy to the Gemini API — function-calling loop, Bleach Wiki lookups, save-slot API, and 429/503 retry logic |

## Multiple characters, multiple saves

Every character you create is its own save slot, stored as a JSON file under
`saves/` (created automatically, one file per character, gitignored since it's
your personal playthrough data — not project source).

- On launch you land on a **save select** screen listing every character
  you've created, with faction, realm, and last-played time.
- **Continue** loads that character's full history back into the transcript
  exactly where you left off.
- **+ New Character** goes through the creator and starts a fresh save.
- The game **autosaves after every turn** (no manual save button needed) via
  `PUT /api/saves/:id`.
- **Delete** removes a save permanently (two-click confirm) — there's no undo,
  so double check before confirming.
- **← Menu** (top of the sidebar during play) returns to the save select
  screen without losing progress.

## Setup

1. **Install Node.js 18+** (needed for the built-in `fetch` in `server.js`).

2. **Get a free Gemini API key** at https://aistudio.google.com/apikey
   - Sign in with a Google account
   - Click "Create API key" — takes about a minute, no credit card
   - The free tier gives you ~1,500 requests per day, which is far more than
     a text RPG needs.

3. **Install dependencies**
   ```bash
   npm install
   ```

4. **Add your API key**

   A `.env` file already exists at the project root with a placeholder. Open
   it and replace `PASTE_YOUR_KEY_HERE` with your real Gemini key:
   ```
   GEMINI_API_KEY=your-actual-key-goes-here
   ```

   Optional — for scene illustration, also add a free Hugging Face token (see
   [Scene illustration](#scene-illustration-optional) below):
   ```
   HUGGINGFACE_API_KEY=your-hugging-face-token-here
   ```

5. **Run both processes** (two terminals):
   ```bash
   # Terminal 1 — the GM proxy
   npm run server

   # Terminal 2 — the web app
   npm run dev
   ```

6. Open the URL Vite prints (usually http://localhost:5173).

## How the GM stays in sync with the game

Each turn, the engine:

1. Injects the **authoritative game state** (resources, stats, flags) into the
   system prompt inside `<STATE>` tags.
2. Sends the running transcript to Gemini via `/api/gm`, with a
   `lookup_bleach_wiki` tool available via function calling.
3. Whenever the GM needs an exact canon fact, it calls the tool instead of
   guessing; `server.js` queries the Bleach Wiki's MediaWiki API, hands the
   extract back to Gemini, and loops (up to 3 lookups per turn) until Gemini
   is ready to narrate.
4. Gemini replies with `[NARRATIVE]`, a machine-readable `[STATE_DELTA]` json
   block, and `[OPTIONS]`.
5. `gameEngine.js` parses the delta, updates the gauges/stats, and strips the
   machinery so the player only sees prose + choices + any canon source links.

This keeps the fiction and the UI numbers consistent — the model narrates, but
the engine owns the math, and the wiki keeps the lore honest.

## Scene illustration (optional)

Click **"🎨 Illustrate This Scene"** under any GM narrative to generate a
black-and-white manga-style image of it, drawn from your character's
appearance, sealed weapon, and that scene's text.

- **Setup:** get a free token at https://huggingface.co/settings/tokens (the
  **Inference** scope is all it needs — not Read-Only/Write/Full Access), then
  add it to `.env` as `HUGGINGFACE_API_KEY=...`. Without it, the button will
  show an error but the rest of the game works normally.
- **Model:** `black-forest-labs/FLUX.1-schnell` via Hugging Face's free
  `hf-inference` router. This was chosen by testing several anime/manga-tuned
  checkpoints directly — most (Animagine, Counterfeit, base SDXL, etc.) come
  back `"not supported by provider hf-inference"` or `"deprecated"` on the
  free tier; FLUX.1-schnell is one of the few still served for free and it
  responds well to an explicit "Tite Kubo's Bleach manga" style prompt.
- **On-demand, not automatic:** illustration is a manual per-scene action, not
  generated on every turn, to keep turns fast and avoid burning through the
  free tier's request limits silently.
- **Not saved:** generated images live only in the current browser session
  (they're not written into your save file), since embedding images would
  bloat the JSON saves considerably over a long campaign. Reload or resume a
  save and you'll need to re-illustrate any scene you want to see again.
- **Known quirk:** the model sometimes renders illegible pseudo-text on
  in-scene signage/backgrounds (a common diffusion-model artifact) — harmless,
  just don't expect it to spell anything real.

## Free-tier notes

- **Model:** defaults to `gemini-flash-latest`, a Google-maintained alias that
  always points at their current recommended free-tier flash model — it keeps
  working even after a specific dated model (like the old `gemini-2.5-flash`)
  gets retired. If you see a `404 ... no longer available` error, it means
  Google retired whatever's in `MODEL`; switch `.env` back to
  `gemini-flash-latest` (or check https://aistudio.google.com/apikey for the
  current model list). For higher requests-per-minute in fast bursts, try
  `gemini-flash-lite-latest`.
- **Rate limits:** roughly 15 requests/minute and 1,500/day on the free tier.
  Each turn costs at least one Gemini request, and can cost a few more when
  the GM looks things up on the wiki (up to 3 lookups per turn). The server
  auto-retries on `429` (rate limited) and `503` (overloaded) responses with
  exponential backoff (~1s, 2s, 4s, 8s) honoring any `Retry-After` header, up
  to 4 attempts, before giving up with a friendly "rate limited, try again"
  message shown right in the transcript.
- **Data privacy:** on the free tier, Google may use your prompts to improve
  their models. Fine for a game; don't send anything sensitive.
- **Bleach Wiki content:** the GM's canon lookups pull text from
  bleach.fandom.com, which is licensed CC-BY-SA. That's fine for personal play;
  if you ever share transcripts or screenshots publicly, keep the attribution
  in mind.
- **Image generation:** the original design called for auto-drawn character art.
  That isn't wired up here. The HUD + character sheet act as the visual
  companion instead.

## Moving into VS Code

Just open the `bleach-rpg` folder in VS Code (`File → Open Folder`). Everything
is plain React/JS — no build tooling to configure beyond `npm install`.
