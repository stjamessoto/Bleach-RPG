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

// Send the running transcript to the GM proxy and get the next turn. The
// server streams progress as Server-Sent Events (retries, wiki lookups) via
// onStatus(message), then resolves with { text, sources } once the GM's
// reply is complete. sources is [{title, url}] for any Bleach Wiki pages
// consulted this turn.
export async function requestTurn({ character, pools, flags, history, onStatus }) {
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

  if (!res.ok) {
    // Only happens if the server errored before it could start streaming
    // (e.g. a malformed request body).
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `GM request failed: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sepIndex;
    while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
      const rawEvent = buffer.slice(0, sepIndex).trim();
      buffer = buffer.slice(sepIndex + 2);
      if (!rawEvent.startsWith("data:")) continue;

      const payload = JSON.parse(rawEvent.slice(5).trim());

      if (payload.type === "status") {
        onStatus?.(payload.message);
      } else if (payload.type === "done") {
        return { text: payload.text, sources: payload.sources || [] };
      } else if (payload.type === "error") {
        throw new Error(payload.message || "GM request failed");
      }
    }
  }

  throw new Error("GM stream ended unexpectedly with no response.");
}

// Request an on-demand manga-style illustration of a scene. Returns an
// object URL for the generated image (valid for this browser session only —
// illustrations are not persisted into saves).
export async function requestSceneImage({ appearance, weapon, narrative }) {
  const res = await fetch("/api/scene-image", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ appearance, weapon, narrative }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Image generation failed: ${res.status}`);
  }

  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
