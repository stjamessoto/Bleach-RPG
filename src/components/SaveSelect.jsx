// SaveSelect.jsx — pick a saved character to continue, or forge a new one
import React, { useState } from "react";
import { deleteSave } from "../engine/saves.js";

export default function SaveSelect({ saves, error, onContinue, onDelete, onNew }) {
  const [confirmingId, setConfirmingId] = useState(null);
  const [busyId, setBusyId] = useState(null);

  async function handleDelete(id) {
    setBusyId(id);
    try {
      await deleteSave(id);
      onDelete();
    } finally {
      setBusyId(null);
      setConfirmingId(null);
    }
  }

  return (
    <div className="creator save-select">
      <h1 className="title-card">
        BLEACH<span>: ASHES OF THE SOUL</span>
      </h1>
      <p className="tagline">Choose a soul to carry forward, or forge a new one.</p>

      {error && <div className="entry error">⚠ {error}</div>}

      <div className="save-list">
        {saves.length === 0 && (
          <p className="empty-note">No saved characters yet. Create your first below.</p>
        )}
        {saves.map((s) => (
          <div key={s.id} className="save-card">
            <button className="save-card-main" onClick={() => onContinue(s.id)}>
              <strong>{s.name}</strong>
              <span className="save-meta">
                {s.primaryLabel}
                {s.secondaryLabel ? ` · ${s.secondaryLabel}` : ""} — {s.realm}
              </span>
              <span className="save-date">
                Last played {new Date(s.updatedAt).toLocaleString()}
              </span>
            </button>
            <div className="save-card-actions">
              <button className="continue-btn" onClick={() => onContinue(s.id)}>
                Continue
              </button>
              {confirmingId === s.id ? (
                <button
                  className="delete-btn confirm"
                  disabled={busyId === s.id}
                  onClick={() => handleDelete(s.id)}
                >
                  Confirm Delete
                </button>
              ) : (
                <button className="delete-btn" onClick={() => setConfirmingId(s.id)}>
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <button className="begin-btn" onClick={onNew}>
        + New Character
      </button>
    </div>
  );
}
