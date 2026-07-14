// GameScreen.jsx — the running game: transcript, player input, GM turns, autosave
import React, { useState, useRef, useEffect } from "react";
import HUD from "./HUD.jsx";
import { requestTurn, parseDelta, applyDelta } from "../engine/gameEngine.js";
import { updateSave } from "../engine/saves.js";

export default function GameScreen({
  saveId,
  character,
  pools: initialPools,
  flags: initialFlags,
  history: initialHistory,
  log: initialLog,
  onExit,
}) {
  const [character_, setCharacter] = useState(character);
  const [pools, setPools] = useState(initialPools);
  const [flags, setFlags] = useState(initialFlags || {});
  const [history, setHistory] = useState(initialHistory || []); // {role, content}
  const [log, setLog] = useState(initialLog || []); // rendered narrative entries
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log, busy]);

  // Tick an elapsed-time counter while a turn is in flight — Gemini calls can
  // take a while (retries, wiki lookups), so this plus the live status
  // message gives real feedback instead of a static "loading" line.
  useEffect(() => {
    if (!busy) {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 250);
    return () => clearInterval(id);
  }, [busy]);

  // Only kick off the prologue for a brand-new character. Resumed saves
  // already have a history and should just render their existing log.
  useEffect(() => {
    if ((initialHistory || []).length === 0) {
      sendTurn(
        "Begin the prologue. Introduce my character in their starting realm and present my first choices.",
        true
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendTurn(playerText, isOpening = false) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setStatusMessage("Consulting Gemini…");

    const nextHistory = [...history, { role: "user", content: playerText }];
    const nextLogBase = isOpening ? log : [...log, { who: "player", text: playerText }];
    if (!isOpening) setLog(nextLogBase);
    setHistory(nextHistory);

    try {
      const { text, sources } = await requestTurn({
        character: character_,
        pools,
        flags,
        history: nextHistory,
        onStatus: setStatusMessage,
      });

      const { delta, narrative } = parseDelta(text);
      const applied = applyDelta(delta, pools, character_, flags);
      const finalHistory = [...nextHistory, { role: "assistant", content: text }];
      const finalLog = [...nextLogBase, { who: "gm", text: narrative, sources }];

      setPools(applied.pools);
      setCharacter(applied.character);
      setFlags(applied.flags);
      setHistory(finalHistory);
      setLog(finalLog);

      updateSave(saveId, {
        character: applied.character,
        pools: applied.pools,
        flags: applied.flags,
        history: finalHistory,
        log: finalLog,
      }).catch((e) => console.warn("Autosave failed:", e.message));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      setStatusMessage("");
    }
  }

  function onSubmit() {
    if (!input.trim() || busy) return;
    const t = input.trim();
    setInput("");
    sendTurn(t);
  }

  return (
    <div className="game">
      <HUD character={character_} pools={pools} flags={flags} onExit={onExit} />

      <main className="transcript">
        {log.map((entry, i) => (
          <div key={i} className={`entry ${entry.who}`}>
            {entry.who === "player" && <span className="you-tag">You ▸ </span>}
            <div className="entry-text">{entry.text}</div>
            {entry.sources && entry.sources.length > 0 && (
              <div className="sources">
                {entry.sources.map((s, j) => (
                  <a
                    key={j}
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="source-link"
                  >
                    📖 Canon: {s.title}
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="entry gm loading">
            <div className="progress-bar">
              <div className="progress-fill" />
            </div>
            <div className="progress-status">
              {statusMessage || "The GM weaves fate…"}{" "}
              <span className="progress-elapsed">({elapsed}s)</span>
            </div>
          </div>
        )}
        {error && (
          <div className="entry error">
            ⚠ {error.toLowerCase().includes("rate limited")
              ? "The spirit realm is congested (rate limited). Wait a few seconds and try again."
              : error}
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      <div className="input-bar">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSubmit()}
          placeholder="Type an action, or a number to choose an option…"
          disabled={busy}
        />
        <button onClick={onSubmit} disabled={busy || !input.trim()}>
          Act
        </button>
      </div>
    </div>
  );
}
