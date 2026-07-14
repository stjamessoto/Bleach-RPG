// App.jsx — top-level router: pick/continue a save, create a character, or play
import React, { useState, useEffect } from "react";
import CharacterCreator from "./components/CharacterCreator.jsx";
import GameScreen from "./components/GameScreen.jsx";
import SaveSelect from "./components/SaveSelect.jsx";
import { buildResourcePools } from "./data/factions.js";
import { listSaves, loadSave, createSave } from "./engine/saves.js";

export default function App() {
  const [view, setView] = useState("loading"); // loading | select | create | play
  const [saves, setSaves] = useState([]);
  const [active, setActive] = useState(null); // full save record while playing
  const [error, setError] = useState(null);

  useEffect(() => {
    refreshSaves();
  }, []);

  async function refreshSaves() {
    try {
      const list = await listSaves();
      setSaves(list);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
    setView("select");
  }

  async function handleNewCharacter(char) {
    const pools = buildResourcePools(char.primaryFaction, char.secondaryFaction);
    const saved = await createSave({ character: char, pools, flags: {}, history: [], log: [] });
    setActive(saved);
    setView("play");
  }

  async function handleContinue(id) {
    try {
      const saved = await loadSave(id);
      setActive(saved);
      setView("play");
    } catch (e) {
      setError(e.message);
      setView("select");
    }
  }

  function handleExitToMenu() {
    setActive(null);
    refreshSaves();
  }

  if (view === "loading") {
    return <div className="loading-screen">Loading saved souls…</div>;
  }

  if (view === "create") {
    return (
      <CharacterCreator
        onComplete={handleNewCharacter}
        onCancel={() => setView("select")}
      />
    );
  }

  if (view === "play" && active) {
    return (
      <GameScreen
        key={active.id}
        saveId={active.id}
        character={active.character}
        pools={active.pools}
        flags={active.flags}
        history={active.history}
        log={active.log}
        onExit={handleExitToMenu}
      />
    );
  }

  return (
    <SaveSelect
      saves={saves}
      error={error}
      onContinue={handleContinue}
      onDelete={refreshSaves}
      onNew={() => setView("create")}
    />
  );
}
