export const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );

export const num = (value, d = 1) =>
  Number.isFinite(Number(value)) ? Number(value).toFixed(d) : "--";

export const fmtWeight = (v) =>
  Number.isFinite(Number(v)) ? Number(v).toFixed(2) : "--";

export const fmtClock = (ts) => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export const fmtStamp = (ts) => {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${fmtClock(ts)}`;
};

export const ago = (ts) => {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return "刚刚";
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  return `${Math.floor(s / 86400)} 天前`;
};

export const sexLabel = (sex) => (sex === "female" ? "女" : "男");

export function colorVars(hex) {
  const m = /^#?([\da-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return "";
  const n = parseInt(m[1], 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(c * 0.82));
  return `--mc:rgb(${rgb.join(" ")});--mc-soft:rgba(${rgb.join(",")},0.10);`;
}

export function bmiTone(value) {
  if (!Number.isFinite(value)) return "none";
  if (value < 18.5) return "low";
  if (value < 24) return "ok";
  if (value < 28) return "warn";
  return "bad";
}

export const GRADE_TONE = {
  标准: "ok",
  优秀: "ok",
  偏低: "low",
  不足: "low",
  偏高: "warn",
  过高: "bad",
  高: "bad",
};

export function toneOf(metric, body) {
  if (metric.band === "bmi") return bmiTone(body.bmi);
  const grade = metric.band ? (body.grades || {})[metric.band] : null;
  return grade ? GRADE_TONE[grade] || "none" : "none";
}

export function gaugePos(value, range) {
  const [min, max] = range;
  if (!Number.isFinite(value)) return 0;
  return Math.min(98, Math.max(2, ((value - min) / (max - min)) * 100));
}

export const TONE_COLOR = { low: "#0066cc", ok: "#1d1d1f", warn: "#ff9500", bad: "#ff3b30", none: "#7a7a7a" };
