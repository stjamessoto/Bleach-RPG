// server.js
// A tiny zero-dependency Node HTTP server that forwards chat requests to the
// Google Gemini API (free tier), giving the GM live access to the Bleach Wiki
// via function calling. It keeps your API key out of the browser.
//
// Get a FREE key (no credit card) at: https://aistudio.google.com/apikey
//
// Run with:  node server.js
// (reads GEMINI_API_KEY from .env — see README)
//
// It listens on :8787 and exposes POST /api/gm

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

// --- Tiny .env parser (no dependency needed) ---
try {
  const env = fs.readFileSync(new URL("./.env", import.meta.url), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (m) {
      const key = m[1];
      let val = (m[2] || "").trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      if (!(key in process.env)) process.env[key] = val;
    }
  }
} catch {
  /* no .env file, that's fine — rely on real env vars */
}

const API_KEY = process.env.GEMINI_API_KEY;
// "gemini-flash-latest" is a Google-maintained alias that always points to
// their current recommended free-tier flash model, so it keeps working when
// a specific dated model (like gemini-2.5-flash) gets retired.
const MODEL = process.env.MODEL || "gemini-flash-latest";
const PORT = process.env.PORT || 8787;

if (!API_KEY || API_KEY === "PASTE_YOUR_KEY_HERE") {
  console.warn(
    "\n[!] GEMINI_API_KEY is not set. The GM will not respond until you set it.\n" +
      "    Get a free key at https://aistudio.google.com/apikey\n" +
      "    Then paste it into .env as GEMINI_API_KEY=...\n"
  );
}

// ---------------------------------------------------------------------------
// Retry helper — wraps every Gemini fetch. Retries on 429 (rate limited) and
// 503 (overloaded) with exponential backoff + jitter, honoring Retry-After
// when it's larger than our own backoff schedule.
// ---------------------------------------------------------------------------
const BACKOFF_MS = [1000, 2000, 4000, 8000];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options, label = "gemini") {
  let lastErr = null;

  for (let attempt = 0; attempt < BACKOFF_MS.length; attempt++) {
    let res;
    try {
      res = await fetch(url, options);
    } catch (err) {
      lastErr = err;
      console.warn(`[retry] ${label}: network error on attempt ${attempt + 1}: ${err.message}`);
      await sleep(BACKOFF_MS[attempt] + Math.random() * 300);
      continue;
    }

    if (res.status !== 429 && res.status !== 503) {
      return res;
    }

    lastErr = res;
    const retryAfterHeader = res.headers.get("retry-after");
    const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : 0;
    const backoff = BACKOFF_MS[attempt] + Math.random() * 300;
    const waitMs = Math.max(backoff, retryAfterMs || 0);

    console.warn(
      `[retry] ${label}: got HTTP ${res.status}, attempt ${attempt + 1}/${BACKOFF_MS.length}, waiting ${Math.round(waitMs)}ms`
    );
    await sleep(waitMs);
  }

  // Exhausted retries — return the last response/error so the caller can
  // surface a clean message.
  if (lastErr instanceof Response) return lastErr;
  throw lastErr || new Error("Gemini request failed after retries");
}

// ---------------------------------------------------------------------------
// Bleach Wiki lookup — queries the Fandom MediaWiki API directly (no HTML
// scraping). Results are cached in-memory per session.
// ---------------------------------------------------------------------------
const WIKI_BASE = "https://bleach.fandom.com/api.php";
const WIKI_USER_AGENT = "bleach-rpg-gm/1.0 (educational fan-project game master; contact: local-dev)";
const wikiCache = new Map();

async function lookupBleachWiki(query) {
  const cacheKey = String(query || "").trim().toLowerCase();
  if (!cacheKey) return { title: null, extract: "", error: "empty query" };
  if (wikiCache.has(cacheKey)) return wikiCache.get(cacheKey);

  try {
    const searchUrl =
      `${WIKI_BASE}?action=query&list=search&srsearch=${encodeURIComponent(query)}` +
      `&format=json&srlimit=1`;
    const searchRes = await fetch(searchUrl, {
      headers: { "User-Agent": WIKI_USER_AGENT },
    });
    const searchData = await searchRes.json();
    const hit = searchData?.query?.search?.[0];

    if (!hit) {
      const empty = { title: null, extract: "", error: "no results" };
      wikiCache.set(cacheKey, empty);
      return empty;
    }

    const title = hit.title;
    const extractUrl =
      `${WIKI_BASE}?action=query&prop=extracts&explaintext=1&exsectionformat=plain` +
      `&titles=${encodeURIComponent(title)}&format=json&redirects=1`;
    const extractRes = await fetch(extractUrl, {
      headers: { "User-Agent": WIKI_USER_AGENT },
    });
    const extractData = await extractRes.json();
    const pages = extractData?.query?.pages || {};
    const page = Object.values(pages)[0];
    let extract = page?.extract || "";
    if (extract.length > 1500) extract = extract.slice(0, 1500).trim() + "…";

    const result = {
      title,
      url: `https://bleach.fandom.com/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
      extract,
    };
    wikiCache.set(cacheKey, result);
    return result;
  } catch (err) {
    return { title: null, extract: "", error: "lookup failed" };
  }
}

// ---------------------------------------------------------------------------
// Gemini plumbing
// ---------------------------------------------------------------------------
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const WIKI_TOOL = {
  functionDeclarations: [
    {
      name: "lookup_bleach_wiki",
      description:
        "Look up canonical Bleach lore from the Bleach Wiki. Call this BEFORE " +
        "narrating whenever you need exact canon facts — Kidō names and " +
        "incantation numbers, Zanpakutō/Espada/Arrancar abilities, Quincy or " +
        "Hollow techniques, character or faction details. Returns a factual " +
        "page extract.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "What to look up, e.g. 'Hadō 31 Shakkahō' or 'Ulquiorra Resurrección'",
          },
        },
        required: ["query"],
      },
    },
  ],
};

// Convert our internal {role, content} history into Gemini's "contents" format.
// Gemini uses roles "user" and "model" (not "assistant").
function toGeminiContents(messages) {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

async function callGemini(contents, system, maxTokens) {
  const res = await fetchWithRetry(
    GEMINI_URL,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": API_KEY,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        tools: [WIKI_TOOL],
        generationConfig: {
          maxOutputTokens: maxTokens || 1500,
          temperature: 0.9,
        },
      }),
    },
    "generateContent"
  );

  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

// Runs the function-calling loop: ask Gemini, execute any lookup_bleach_wiki
// calls it requests, feed results back, repeat (capped) until it stops asking.
async function runGmTurn({ system, messages, maxTokens }) {
  const contents = toGeminiContents(messages);
  const sources = [];
  const MAX_LOOKUPS = 3;
  let lookupCount = 0;

  for (let round = 0; round <= MAX_LOOKUPS; round++) {
    const { ok, status, data } = await callGemini(contents, system, maxTokens);

    if (!ok) {
      if (status === 429 || status === 503) {
        const err = new Error("Rate limited by Gemini — wait a moment and try again.");
        err.rateLimited = true;
        throw err;
      }
      const err = new Error(`Gemini error ${status}: ${JSON.stringify(data)}`);
      throw err;
    }

    const candidate = data?.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    const functionCalls = parts.filter((p) => p.functionCall);

    if (functionCalls.length === 0 || lookupCount >= MAX_LOOKUPS) {
      const text = parts.map((p) => p.text || "").join("");
      return { text, sources };
    }

    // Record the model's turn (including the functionCall parts) in the transcript.
    contents.push({ role: "model", parts });

    // Execute each requested lookup and append the results as one user turn.
    const responseParts = [];
    for (const part of functionCalls) {
      if (lookupCount >= MAX_LOOKUPS) break;
      lookupCount++;
      const query = part.functionCall.args?.query || "";
      console.log(`[wiki] lookup: "${query}"`);
      const result = await lookupBleachWiki(query);
      if (result.title) {
        sources.push({ title: result.title, url: result.url });
      }
      responseParts.push({
        functionResponse: {
          name: "lookup_bleach_wiki",
          response: { result },
        },
      });
    }
    contents.push({ role: "user", parts: responseParts });
  }

  // Safety net — shouldn't normally reach here given the loop bound above.
  return { text: "", sources };
}

// ---------------------------------------------------------------------------
// Save slots — each character/playthrough is a JSON file on disk under
// saves/. This survives browser cache clears, unlike localStorage, and lets
// the player keep multiple characters going at once.
// ---------------------------------------------------------------------------
const SAVES_DIR = fileURLToPath(new URL("./saves/", import.meta.url));
fs.mkdirSync(SAVES_DIR, { recursive: true });

const SAVE_ID_RE = /^[a-zA-Z0-9-]+$/;

function saveFilePath(id) {
  if (typeof id !== "string" || !SAVE_ID_RE.test(id)) return null;
  return path.join(SAVES_DIR, `${id}.json`);
}

function listSaveSummaries() {
  const files = fs.readdirSync(SAVES_DIR).filter((f) => f.endsWith(".json"));
  const summaries = files
    .map((f) => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(SAVES_DIR, f), "utf8"));
        return {
          id: data.id,
          name: data.character?.name,
          primaryLabel: data.character?.primaryLabel,
          secondaryLabel: data.character?.secondaryLabel || null,
          realm: data.character?.realm,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  summaries.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  return summaries;
}

async function handleSavesRoute(req, res, id) {
  try {
    if (req.method === "GET" && !id) {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify(listSaveSummaries()));
    }

    if (req.method === "GET" && id) {
      const file = saveFilePath(id);
      if (!file || !fs.existsSync(file)) {
        res.writeHead(404, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: "save not found" }));
      }
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(fs.readFileSync(file, "utf8"));
    }

    if (req.method === "POST" && !id) {
      const raw = await readBody(req);
      const body = JSON.parse(raw);
      const newId = crypto.randomUUID();
      const now = new Date().toISOString();
      const record = { ...body, id: newId, createdAt: now, updatedAt: now };
      fs.writeFileSync(saveFilePath(newId), JSON.stringify(record, null, 2));
      res.writeHead(201, { "content-type": "application/json" });
      return res.end(JSON.stringify(record));
    }

    if (req.method === "PUT" && id) {
      const file = saveFilePath(id);
      if (!file || !fs.existsSync(file)) {
        res.writeHead(404, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: "save not found" }));
      }
      const existing = JSON.parse(fs.readFileSync(file, "utf8"));
      const raw = await readBody(req);
      const body = JSON.parse(raw);
      const record = {
        ...existing,
        ...body,
        id,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      };
      fs.writeFileSync(file, JSON.stringify(record, null, 2));
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify(record));
    }

    if (req.method === "DELETE" && id) {
      const file = saveFilePath(id);
      if (!file || !fs.existsSync(file)) {
        res.writeHead(404, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: "save not found" }));
      }
      fs.unlinkSync(file);
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ ok: true }));
    }

    res.writeHead(405, { "content-type": "application/json" });
    return res.end(JSON.stringify({ error: "method not allowed" }));
  } catch (err) {
    res.writeHead(500, { "content-type": "application/json" });
    return res.end(JSON.stringify({ error: String(err) }));
  }
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  if (req.method === "POST" && req.url === "/api/gm") {
    try {
      const raw = await readBody(req);
      const { system, messages, max_tokens } = JSON.parse(raw);

      const { text, sources } = await runGmTurn({
        system,
        messages,
        maxTokens: max_tokens,
      });

      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ text, sources }));
    } catch (err) {
      const status = err.rateLimited ? 429 : 500;
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: err.message || String(err) }));
    }
    return;
  }

  const parsedUrl = new URL(req.url, "http://localhost");
  const segments = parsedUrl.pathname.split("/").filter(Boolean);

  if (segments[0] === "api" && segments[1] === "saves") {
    return handleSavesRoute(req, res, segments[2]);
  }

  res.writeHead(404, { "content-type": "text/plain" });
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`\n  GM proxy listening on http://localhost:${PORT}`);
  console.log(`  Model: ${MODEL} (Google Gemini free tier)`);
  console.log(`  Bleach Wiki lookups: enabled (bleach.fandom.com)`);
  console.log(`  Saves directory: ${SAVES_DIR}\n`);
});
