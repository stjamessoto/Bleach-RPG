// CharacterCreator.jsx — the Character Creation Suite
import React, { useState } from "react";
import { FACTIONS } from "../data/factions.js";

export default function CharacterCreator({ onComplete, onCancel }) {
  const [name, setName] = useState("");
  const [primary, setPrimary] = useState("soul_reaper");
  const [hybrid, setHybrid] = useState(false);
  const [secondary, setSecondary] = useState("hollow");
  const [appearance, setAppearance] = useState("");
  const [weapon, setWeapon] = useState("");

  const ready = name.trim() && appearance.trim() && weapon.trim();

  function submit() {
    const p = FACTIONS[primary];
    const s = hybrid ? FACTIONS[secondary] : null;
    onComplete({
      name: name.trim(),
      primaryFaction: primary,
      secondaryFaction: hybrid ? secondary : null,
      primaryLabel: p.name,
      secondaryLabel: s ? s.name : null,
      appearance: appearance.trim(),
      weapon: weapon.trim(),
      realm: "Karakura Town",
      stats: { ...p.stats },
      auraColor: p.auraColorDefault,
    });
  }

  return (
    <div className="creator">
      {onCancel && (
        <button className="back-link" onClick={onCancel}>
          ← Back to Saves
        </button>
      )}
      <h1 className="title-card">
        BLEACH<span>: ASHES OF THE SOUL</span>
      </h1>
      <p className="tagline">
        The world breathes in two rhythms — the living and the dead.
        Forge who you are.
      </p>

      <label className="field">
        <span>① Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="What name does the world scream, whisper, or curse?"
        />
      </label>

      <label className="field">
        <span>② Origin / Faction</span>
        <div className="faction-grid">
          {Object.values(FACTIONS).map((f) => (
            <button
              key={f.id}
              className={`faction-card ${primary === f.id ? "sel" : ""}`}
              onClick={() => setPrimary(f.id)}
              style={{ "--accent": f.auraColorDefault }}
            >
              <strong>{f.name}</strong>
              <em>{f.jp}</em>
              <small>{f.blurb}</small>
              <span className="res-tag">{f.resource.label}</span>
            </button>
          ))}
        </div>
      </label>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={hybrid}
          onChange={(e) => setHybrid(e.target.checked)}
        />
        <span>
          Hybrid lineage (Visored, Shinigami-Quincy, etc.) — multiple gauges,
          unstable mastery, hunted by nearly everyone.
        </span>
      </label>

      {hybrid && (
        <label className="field">
          <span>Secondary Path</span>
          <select value={secondary} onChange={(e) => setSecondary(e.target.value)}>
            {Object.values(FACTIONS)
              .filter((f) => f.id !== primary)
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
          </select>
        </label>
      )}

      <label className="field">
        <span>③ Appearance</span>
        <textarea
          value={appearance}
          onChange={(e) => setAppearance(e.target.value)}
          placeholder="Hair, build, scars, attire (customized Shihakushō, Quincy uniform, mask fragment, casual wear)…"
        />
      </label>

      <label className="field">
        <span>④ Sealed Weapon Concept</span>
        <textarea
          value={weapon}
          onChange={(e) => setWeapon(e.target.value)}
          placeholder="Shape, hilt/tsuba, aesthetic, and the feeling it carries…"
        />
      </label>

      <button className="begin-btn" disabled={!ready} onClick={submit}>
        Light the Fuse 🔥
      </button>
    </div>
  );
}
