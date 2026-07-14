// gameEngine.js
// Pure-ish logic layer: parses the GM's [STATE_DELTA] block, applies changes to
// resource pools / stats / flags, and talks to the /api/gm proxy.

import { buildSystemPrompt } from "./systemPrompt.js";

// Pull the ```json ... ``` delta out of the model's reply.
export function parseDelta(text) {
  // Grab the fenced json block after [STATE_DELTA]
  const fenceMatch = text.match(/```json\s*([\s\S]*?)```/i);
  if (!fenceMatch) return { delta: {}, narrative: stripSections(text) };
  try {
    const delta = JSON.parse(fenceMatch[1].trim());
    return { delta, narrative: stripSections(text) };
  } catch {
    return { delta: {}, narrative: stripSections(text) };
  }
}

// Remove the machinery tags so the player only sees prose + options.
function stripSections(text) {
  return text
    .replace(/```json[\s\S]*?```/gi, "")
    .replace(/\[STATE_DELTA\]/gi, "")
    .replace(/\[NARRATIVE\]/gi, "")
    .replace(/\[OPTIONS\]/gi, "\n— Choose —")
    .trim();
}

// Apply a delta to current pools + character, returning new copies.
export function applyDelta(delta, pools, character, flags) {
  const nextPools = structuredClone(pools);
  const nextChar = structuredClone(character);
  const nextFlags = { ...flags, ...(delta.flags || {}) };

  if (delta.resources) {
    for (const [key, change] of Object.entries(delta.resources)) {
      if (nextPools[key]) {
        const p = nextPools[key];
        p.current = clamp(p.current + change, 0, p.max);
      }
    }
  }

  if (delta.stats) {
    for (const [key, change] of Object.entries(delta.stats)) {
      if (typeof nextChar.stats[key] === "number") {
        nextChar.stats[key] = clamp(nextChar.stats[key] + change, 0, 100);
      }
    }
  }

  if (delta.realm) nextChar.realm = delta.realm;

  return { pools: nextPools, character: nextChar, flags: nextFlags };
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

// Send the running transcript to the GM proxy and get the next turn.
// Returns { text, sources } where sources is [{title, url}] for any Bleach
// Wiki pages the GM consulted this turn.
export async function requestTurn({ character, pools, flags, history }) {
  const system = buildSystemPrompt(character, pools, flags);

  const res = await fetch("/api/gm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      system,
      max_tokens: 1500,
      messages: history, // [{role, content}, ...]
    }),
  });

  const data = await res.json();

  if (!res.ok || data.error) {
    if (res.status === 429) {
      throw new Error("Rate limited by Gemini — wait a moment and try again.");
    }
    throw new Error(data.error || `GM request failed: ${res.status}`);
  }

  return { text: data.text, sources: data.sources || [] };
}
