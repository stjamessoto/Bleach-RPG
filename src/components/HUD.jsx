// HUD.jsx — visible stat + resource tracking (state management requirement)
import React from "react";

function Gauge({ label, current, max, color }) {
  const pct = Math.round((current / max) * 100);
  return (
    <div className="gauge">
      <div className="gauge-label">
        <span>{label}</span>
        <span className="gauge-num">
          {current}/{max}
        </span>
      </div>
      <div className="gauge-track">
        <div
          className="gauge-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

function StatBar({ label, value }) {
  return (
    <div className="stat-row">
      <span className="stat-label">{label}</span>
      <div className="stat-track">
        <div className="stat-fill" style={{ width: `${value}%` }} />
      </div>
      <span className="stat-val">{value}</span>
    </div>
  );
}

export default function HUD({ character, pools, flags, onExit }) {
  return (
    <aside className="hud">
      {onExit && (
        <button className="menu-btn" onClick={onExit}>
          ← Menu
        </button>
      )}
      <div className="hud-name">{character.name}</div>
      <div className="hud-faction">
        {character.primaryLabel}
        {character.secondaryLabel ? ` · ${character.secondaryLabel}` : ""}
      </div>
      <div className="hud-realm">📍 {character.realm}</div>

      <h4>Resources</h4>
      {Object.values(pools).map((p) => (
        <Gauge
          key={p.key}
          label={p.label}
          current={p.current}
          max={p.max}
          color={p.color}
        />
      ))}

      <h4>Attributes</h4>
      <StatBar label="Vitality" value={character.stats.vitality} />
      <StatBar label="Speed / Reflexes" value={character.stats.speed} />
      <StatBar label="Mastery" value={character.stats.mastery} />

      {flags.shikai_unlocked && (
        <div className="hud-flag">⚔ Initial Release UNLOCKED</div>
      )}
      {flags.bankai_unlocked && (
        <div className="hud-flag gold">☯ Final Release UNLOCKED</div>
      )}
    </aside>
  );
}
