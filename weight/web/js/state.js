const LIVE_HOLD_MS = 90_000;

export const state = {
  users: [],
  records: [],
  suggestion: null,
  trendRange: 7,
  live: null,
  selectedId: null,
  filterUser: null,
  scanning: false,
  scanError: null,
  scale: { enabled: false, connected: false, error: null, profile: null },
  connected: false,
  latency: null,
};

export function liveIsFresh() {
  return state.live && Date.now() - Number(state.live.ts || 0) < LIVE_HOLD_MS;
}

export function recordById(id) {
  return state.records.find((r) => r.id === id) || null;
}

export function displayRecord() {
  if (state.selectedId) {
    const hit = recordById(state.selectedId);
    if (hit) return hit;
  }
  return state.records[0] || null;
}

export function view() {
  const rec = displayRecord();
  if (liveIsFresh()) return { mode: "live", record: rec };
  if (rec) return { mode: "record", record: rec };
  return { mode: "empty", record: null };
}

export function bodyOf(v) {
  if (v.mode === "live") return (state.live && state.live.body) || null;
  return (v.record && v.record.body) || null;
}
