import { state, recordById } from "./state.js";
import { esc } from "./utils.js";

const PING_EVERY_MS = 20_000;
let ws = null;
let retry = 0;
let pingTimer = null;
let lastNotice = { text: "", at: 0 };

export function send(payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  } else {
    toast("err", "实时通道未连接，正在重连…");
  }
}

export function connect(onMessage, onToast) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.addEventListener("open", () => {
    state.connected = true;
    retry = 0;
    clearInterval(pingTimer);
    pingTimer = setInterval(() => send({ type: "ping" }), PING_EVERY_MS);
    send({ type: "ping" });
  });
  ws.addEventListener("message", (e) => {
    let data;
    try {
      data = JSON.parse(e.data);
    } catch {
      return;
    }
    onMessage(data);
  });
  ws.addEventListener("close", () => {
    state.connected = false;
    state.latency = null;
    clearInterval(pingTimer);
    retry = Math.min(retry + 1, 6);
    setTimeout(() => connect(onMessage, onToast), 800 * retry);
  });
  ws.addEventListener("error", () => {
    try {
      ws.close();
    } catch {
      /* 交给 close 统一重连 */
    }
  });
}

export function handleMessage(data, onToast) {
  if (!data || !data.type) return;
  switch (data.type) {
    case "devices": {
      state.scanning = !!data.scanning;
      state.scanError = data.error || null;
      if (data.scale) state.scale = data.scale;
      if (data.weight && !state.live) state.live = data.weight;
      break;
    }
    case "status": {
      state.scanning = !!data.scanning;
      state.scanError = data.error || null;
      if (data.error) notify(data.error, "err", onToast);
      break;
    }
    case "weight": {
      state.live = data;
      state.selectedId = null;
      break;
    }
    case "weight_state": {
      state.users = Array.isArray(data.users) ? data.users : state.users;
      state.records = Array.isArray(data.records) ? data.records : state.records;
      if (state.selectedId && !recordById(state.selectedId)) state.selectedId = null;
      break;
    }
    case "notice": {
      notify(data.text || "", data.level || "warn", onToast);
      break;
    }
    case "pong": {
      state.latency = Math.max(0, Date.now() - Number(data.ts));
      break;
    }
  }
}

function notify(text, level, onToast) {
  if (!text) return;
  const now = Date.now();
  if (text === lastNotice.text && now - lastNotice.at < 6000) return;
  lastNotice = { text, at: now };
  onToast(level, text);
}

export function toast(level, text, container) {
  const node = document.createElement("div");
  node.className = `toast ${level || "info"}`;
  node.innerHTML = `<i class="bar"></i><span>${esc(text)}</span>`;
  container.appendChild(node);
  setTimeout(() => {
    node.classList.add("out");
    setTimeout(() => node.remove(), 320);
  }, level === "err" ? 6000 : 3200);
  while (container.children.length > 4) container.firstChild.remove();
}

