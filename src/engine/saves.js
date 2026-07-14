// saves.js — client for the /api/saves save-slot API (multiple characters,
// multiple independent playthroughs, persisted server-side as JSON files).

async function handle(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

export async function listSaves() {
  const res = await fetch("/api/saves");
  return handle(res);
}

export async function loadSave(id) {
  const res = await fetch(`/api/saves/${id}`);
  return handle(res);
}

export async function createSave({ character, pools, flags, history, log }) {
  const res = await fetch("/api/saves", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ character, pools, flags, history, log }),
  });
  return handle(res);
}

export async function updateSave(id, patch) {
  const res = await fetch(`/api/saves/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  return handle(res);
}

export async function deleteSave(id) {
  const res = await fetch(`/api/saves/${id}`, { method: "DELETE" });
  return handle(res);
}
