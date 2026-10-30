const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );

const num = (value, d = 1) =>
  Number.isFinite(Number(value)) ? Number(value).toFixed(d) : "--";

const fmtWeight = (v) =>
  Number.isFinite(Number(v)) ? Number(v).toFixed(2) : "--";

const pad = (value) => String(value).padStart(2, "0");

const fmtClock = (ts) => {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const fmtStamp = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${fmtClock(ts)}`;
};

const fmtMoment = (ts) => {
  const d = new Date(ts);
  const now = new Date();
  if (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  ) {
    return `今天 ${fmtClock(ts)}`;
  }
  if (d.getFullYear() === now.getFullYear()) {
    return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${fmtClock(ts)}`;
  }
  return fmtStamp(ts);
};

const fmtDay = (ts) => {
  const d = new Date(ts);
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
};

const ago = (ts) => {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return "刚刚";
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  return `${Math.floor(s / 86400)} 天前`;
};

const sexLabel = (sex) => (sex === "female" ? "女" : "男");

function colorVars(hex) {
  const m = /^#?([\da-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return "";
  const n = parseInt(m[1], 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(c * 0.82));
  return `--mc:rgb(${rgb.join(" ")});--mc-soft:rgba(${rgb.join(",")},0.10);`;
}

function bmiTone(value) {
  if (!Number.isFinite(value)) return "none";
  if (value < 18.5) return "low";
  if (value < 24) return "ok";
  if (value < 28) return "warn";
  return "bad";
}

const GRADE_TONE = {
  标准: "ok",
  优秀: "ok",
  偏低: "low",
  不足: "low",
  偏高: "warn",
  过高: "bad",
  高: "bad",
};

function toneOf(metric, body) {
  if (metric.band === "bmi") return bmiTone(body.bmi);
  const grade = metric.band ? (body.grades || {})[metric.band] : null;
  return grade ? GRADE_TONE[grade] || "none" : "none";
}

function gaugePos(value, range) {
  const [min, max] = range;
  if (!Number.isFinite(value)) return 0;
  return Math.min(98, Math.max(2, ((value - min) / (max - min)) * 100));
}

const TONE_COLOR = { low: "#0066cc", ok: "#1d1d1f", warn: "#ff9500", bad: "#ff3b30", none: "#7a7a7a" };

const LIVE_HOLD_MS = 90_000;

const state = {
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

function liveIsFresh() {
  return state.live && Date.now() - Number(state.live.ts || 0) < LIVE_HOLD_MS;
}

function recordById(id) {
  return state.records.find((r) => r.id === id) || null;
}

function displayRecord() {
  if (state.selectedId) {
    const hit = recordById(state.selectedId);
    if (hit) return hit;
  }
  return state.records[0] || null;
}

function view() {
  const rec = displayRecord();
  if (liveIsFresh()) return { mode: "live", record: rec };
  if (rec) return { mode: "record", record: rec };
  return { mode: "empty", record: null };
}

function bodyOf(v) {
  if (v.mode === "live") return (state.live && state.live.body) || null;
  return (v.record && v.record.body) || null;
}




const METRICS = [
  { key: "bmi", label: "BMI", unit: "", d: 2, band: "bmi" },
  { key: "body_fat", label: "体脂率", unit: "%", d: 2, band: "body_fat" },
  { key: "visceral_fat", label: "内脏脂肪", unit: "级", d: 0, band: "visceral_fat" },
  { key: "muscle", label: "肌肉量", unit: "kg", d: 2, band: "muscle" },
  { key: "fat_mass", label: "体脂量", unit: "kg", d: 2, band: "fat_mass" },
  { key: "sub_fat_pct", label: "皮下脂肪率", unit: "%", d: 2, band: "sub_fat" },
  { key: "sub_fat_mass", label: "皮下脂肪量", unit: "kg", d: 2, band: "sub_fat" },
  { key: "water", label: "水分率", unit: "%", d: 2, band: "water" },
  { key: "water_mass", label: "水分量", unit: "kg", d: 2, band: "water_mass" },
  { key: "protein_rate", label: "蛋白质率", unit: "%", d: 2, band: "protein" },
  { key: "protein_mass", label: "蛋白质量", unit: "kg", d: 2, band: "protein" },
  { key: "bone", label: "骨量", unit: "kg", d: 2, band: "bone" },
  { key: "bone_rate", label: "骨量率", unit: "%", d: 2, band: "bone" },
  { key: "muscle_rate", label: "肌肉率", unit: "%", d: 2, band: "muscle_rate" },
  { key: "skeletal_muscle", label: "骨骼肌量", unit: "kg", d: 2, band: "skeletal_muscle" },
  { key: "skeletal_muscle_rate", label: "骨骼肌率", unit: "%", d: 2, band: "skeletal_muscle_rate" },
  { key: "lean_mass", label: "去脂体重", unit: "kg", d: 2, band: "" },
  { key: "bmr", label: "基础代谢", unit: "kcal", d: 0, band: "" },
];

function gradeText(metric, body) {
  if (metric.band === "bmi") {
    const bmi = body.bmi;
    if (bmi < 18.5) return "偏低";
    if (bmi < 24) return "标准";
    if (bmi < 28) return "偏高";
    return "过高";
  }
  const grade = metric.band ? (body.grades || {})[metric.band] : null;
  return grade || "参考";
}

function gradeTone(metric, body) {
  if (metric.band === "bmi") {
    const bmi = body.bmi;
    if (bmi < 18.5) return "warn";
    if (bmi < 24) return "ok";
    if (bmi < 28) return "warn";
    return "bad";
  }
  const grade = metric.band ? (body.grades || {})[metric.band] : null;
  if (!grade || grade === "参考") return "ok";
  if (grade === "标准" || grade === "正常") return "ok";
  if (grade === "偏低" || grade === "偏高") return "warn";
  return "bad";
}

function drawHero(el) {
  const v = view();
  const live = state.live;

  // Update center weight display
  if (v.mode === "live") {
    el.weightValue.textContent = fmtWeight(live.kg);
    el.weightTime.textContent = `实时测量`;
  } else if (v.mode === "record") {
    const rec = v.record;
    el.weightValue.textContent = fmtWeight(rec.kg);
    el.weightTime.textContent = `上次测量 · ${fmtMoment(rec.ts)}`;
  } else {
    el.weightValue.textContent = "--";
    el.weightTime.textContent = "等待称重";
  }
}

function drawBodyComposition() {
  const v = view();
  const body = bodyOf(v);

  if (!body) {
    document.getElementById("cardBMI").hidden = true;
    document.getElementById("cardFat").hidden = true;
    document.getElementById("cardMuscle").hidden = true;
    document.getElementById("cardWater").hidden = true;
    const message =
      v.mode === "empty"
        ? "暂无测量数据，先站上秤完成一次称重。"
        : "这条记录没有阻抗数据，暂无可估算的身体成分。";
    document.getElementById("metricsGrid").innerHTML = `<p class="drawer-empty">${message}</p>`;
    return;
  }

  // Show orbit cards
  document.getElementById("cardBMI").hidden = false;
  document.getElementById("cardFat").hidden = false;
  document.getElementById("cardMuscle").hidden = false;
  document.getElementById("cardWater").hidden = false;

  // BMI
  document.getElementById("bmiValue").textContent = num(body.bmi, 2);
  const bmiGradeEl = document.getElementById("bmiGrade");
  bmiGradeEl.textContent = gradeText(METRICS[0], body);
  bmiGradeEl.dataset.tone = gradeTone(METRICS[0], body);

  // Body fat
  document.getElementById("fatValue").innerHTML = `${num(body.body_fat, 2)}<small class="orbit-unit">%</small>`;
  const fatGradeEl = document.getElementById("fatGrade");
  fatGradeEl.textContent = gradeText(METRICS[1], body);
  fatGradeEl.dataset.tone = gradeTone(METRICS[1], body);

  // Muscle
  document.getElementById("muscleValue").innerHTML = `${num(body.muscle, 2)}<small class="orbit-unit">kg</small>`;
  const muscleGradeEl = document.getElementById("muscleGrade");
  muscleGradeEl.textContent = gradeText(METRICS[3], body);
  muscleGradeEl.dataset.tone = gradeTone(METRICS[3], body);

  // Water
  document.getElementById("waterValue").innerHTML = `${num(body.water, 2)}<small class="orbit-unit">%</small>`;
  const waterGradeEl = document.getElementById("waterGrade");
  waterGradeEl.textContent = gradeText(METRICS[7], body);
  waterGradeEl.dataset.tone = gradeTone(METRICS[7], body);

  // Draw detailed metrics grid
  drawMetricsGrid(body);
}

function drawMetricsGrid(body) {
  const grid = document.getElementById("metricsGrid");
  if (!grid) return;

  grid.innerHTML = "";

  METRICS.forEach((metric) => {
    const val = body[metric.key];
    if (!Number.isFinite(val)) return;

    const item = document.createElement("div");
    item.className = "metric-item";

    const name = document.createElement("div");
    name.className = "metric-name";
    name.textContent = metric.label;

    const valueWrap = document.createElement("div");
    valueWrap.className = "metric-val";
    valueWrap.innerHTML = `${num(val, metric.d)}${metric.unit ? `<small>${metric.unit}</small>` : ""}`;

    const grade = document.createElement("div");
    grade.className = "orbit-grade";
    grade.textContent = gradeText(metric, body);
    grade.dataset.tone = gradeTone(metric, body);

    item.appendChild(name);
    item.appendChild(valueWrap);
    item.appendChild(grade);
    grid.appendChild(item);
  });
}

function currentSuggestion() {
  const hint = state.suggestion;
  if (!hint) return null;
  const record = state.records.find((item) => item.id === hint.record_id);
  const user = state.users.find((item) => item.id === hint.user_id);
  if (!record || !user || record.user_id) return null;
  return { ...hint, record, user };
}

function drawMembers(el, actions) {
  el.innerHTML = "";

  const suggest = currentSuggestion();
  if (suggest) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "member-chip member-suggest";
    chip.title = `按历史体重推荐：${suggest.user.name}（参考 ${fmtWeight(suggest.ref_kg)} kg）`;
    chip.innerHTML = `<span class="suggest-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>
      <span class="member-info"><b>归属给 ${esc(suggest.user.name)}</b><span>参考 ${fmtWeight(suggest.ref_kg)} kg · 差 ${num(suggest.diff, 2)} kg</span></span>`;
    chip.addEventListener("click", () =>
      actions.assignSuggested(suggest.record.id, suggest.user.id, suggest.user.name)
    );
    el.appendChild(chip);
  }

  if (!state.users.length) {
    el.innerHTML = '<div class="list-empty">暂无成员，点击右侧按钮添加</div>';
    return;
  }

  state.users.forEach((user) => {
    const chip = document.createElement("div");
    chip.className = `member-chip ${state.filterUser === user.id ? "active" : ""}`;
    chip.style.setProperty("--mc", user.color || "#0066cc");

    const avatar = document.createElement("div");
    avatar.className = "member-avatar";
    avatar.textContent = user.name.charAt(0).toUpperCase();

    const info = document.createElement("div");
    info.className = "member-info";
    const latest = state.records.find((record) => record.user_id === user.id);
    info.innerHTML = `<b>${esc(user.name)}</b><span>${
      latest
        ? `${fmtWeight(latest.kg)} kg<span class="member-time"> · ${fmtMoment(latest.ts)}</span>`
        : "暂无记录"
    }</span>`;

    const edit = document.createElement("button");
    edit.className = "member-edit";
    edit.type = "button";
    edit.title = `编辑 ${user.name} 的资料`;
    edit.setAttribute("aria-label", edit.title);
    edit.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
    edit.addEventListener("click", (event) => {
      event.stopPropagation();
      actions.editUser(user);
    });

    const remove = document.createElement("button");
    remove.className = "member-remove";
    remove.type = "button";
    const owned = Number(user.record_count) || 0;
    remove.title = owned
      ? `${user.name} 名下还有 ${owned} 条记录，请先转移归属`
      : `删除成员 ${user.name}`;
    remove.setAttribute("aria-label", remove.title);
    if (owned) {
      remove.classList.add("is-blocked");
      remove.setAttribute("aria-disabled", "true");
    }
    remove.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"/></svg>';

    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      if (owned) {
        remove.classList.remove("is-shaking");
        void remove.offsetWidth;
        remove.classList.add("is-shaking");
        setTimeout(() => remove.classList.remove("is-shaking"), 480);
        actions.notify("warn", `${user.name} 名下还有 ${owned} 条记录，请先把记录归属给其他成员`);
        return;
      }
      actions.deleteUser(user);
    });

    chip.appendChild(avatar);
    chip.appendChild(info);
    chip.appendChild(edit);
    chip.appendChild(remove);

    chip.addEventListener("click", () => {
      state.filterUser = state.filterUser === user.id ? null : user.id;
      state.selectedId = state.filterUser && latest ? latest.id : null;
      actions.refresh();
    });

    el.appendChild(chip);
  });
}

function drawRecords(el, actions) {
  el.innerHTML = "";

  let records = [...state.records];
  if (state.filterUser) {
    records = records.filter((record) => record.user_id === state.filterUser);
  }

  if (!records.length) {
    el.innerHTML = '<div class="list-empty">暂无测量记录</div>';
    return;
  }

  records.slice(0, 50).forEach((rec) => {
    const row = document.createElement("div");
    row.className = `record ${state.selectedId === rec.id ? "is-active" : ""}`;

    const main = document.createElement("button");
    main.className = "record-main";
    main.type = "button";

    const time = document.createElement("span");
    time.className = "time";
    time.textContent = fmtStamp(rec.ts);
    time.title = fmtStamp(rec.ts);

    const kg = document.createElement("span");
    kg.className = "kg";
    kg.innerHTML = `${fmtWeight(rec.kg)}<small>kg</small>`;

    const owner = document.createElement("span");
    owner.className = "owner";
    if (rec.user_name) {
      const user = state.users.find((item) => item.id === rec.user_id);
      owner.innerHTML = `<i class="bead" style="--mc: ${user?.color || "#999"}"></i>${esc(rec.user_name)}`;
    } else {
      owner.innerHTML = '<em class="none">未归属</em>';
    }

    const flags = document.createElement("span");
    flags.className = "flags";
    if (rec.impedance) {
      flags.innerHTML = `<span class="mini on">${num(rec.impedance, 0)}Ω</span>`;
    }

    main.appendChild(time);
    main.appendChild(kg);
    main.appendChild(owner);
    main.appendChild(flags);

    main.addEventListener("click", () => {
      state.selectedId = rec.id;
      actions.refresh();
    });

    const ops = document.createElement("div");
    ops.className = "record-ops";

    const assign = document.createElement("button");
    assign.className = "record-action";
    assign.type = "button";
    assign.textContent = "归属";
    assign.title = "修改这条记录的成员归属";
    assign.addEventListener("click", () => actions.assignRecord(rec));

    const remove = document.createElement("button");
    remove.className = "record-action is-danger";
    remove.type = "button";
    remove.title = "删除这条测量记录";
    remove.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"/></svg><span>删除</span>';
    remove.addEventListener("click", () => actions.deleteRecord(rec));

    ops.appendChild(assign);
    ops.appendChild(remove);
    row.appendChild(main);
    row.appendChild(ops);
    el.appendChild(row);
  });
}

function drawTrends() {
  const charts = document.getElementById("trendCharts");
  const who = document.getElementById("trendWho");
  if (!charts || !who) return;

  document.querySelectorAll("[data-range]").forEach((button) => {
    button.setAttribute("aria-pressed", String(Number(button.dataset.range) === state.trendRange));
  });

  const selected = state.selectedId
    ? state.records.find((record) => record.id === state.selectedId)
    : null;
  if (selected && !selected.user_id) {
    who.textContent = "趋势";
    charts.innerHTML = '<p class="trend-empty">这条记录尚未归属，无法生成趋势。</p>';
    return;
  }

  const userId = selected?.user_id || state.filterUser || state.records.find((r) => r.user_id)?.user_id;
  const user = state.users.find((item) => item.id === userId);
  if (!user) {
    who.textContent = "趋势";
    charts.innerHTML = '<p class="trend-empty">归属成员后显示体重与体脂率趋势。</p>';
    return;
  }

  who.textContent = `趋势 · ${user.name}`;
  const days = state.trendRange;
  const now = Date.now();
  const cutoff = now - days * DAY_MS;
  const recs = state.records
    .filter((record) => record.user_id === user.id)
    .sort((a, b) => a.ts - b.ts);

  const weightSeries = dailySeries(recs, cutoff, (record) => record.kg);
  const fatSeries = dailySeries(recs, cutoff, (record) => record.body?.body_fat);
  const weightDelta = diffOf(recs.map((record) => record.kg));
  const fatDelta = diffOf(recs.map((record) => record.body?.body_fat));

  const rows = [
    sparkRow({
      label: "体重",
      unit: "kg",
      decimals: 2,
      tone: "weight",
      series: weightSeries,
      delta: weightDelta,
      cutoff,
      now,
      days,
    }),
    sparkRow({
      label: "体脂率",
      unit: "%",
      decimals: 2,
      tone: "fat",
      series: fatSeries,
      delta: fatDelta,
      cutoff,
      now,
      days,
    }),
  ].filter(Boolean);

  charts.innerHTML = rows.length
    ? rows.join("")
    : `<p class="trend-empty">近 ${days} 天暂无测量记录</p>`;
}

const DAY_MS = 86_400_000;
const TREND_W = 360;
const TREND_H = 88;

function dailySeries(records, cutoff, pickValue) {
  const byDay = new Map();
  for (const record of records) {
    if (record.ts < cutoff) continue;
    const value = Number(pickValue(record));
    if (!Number.isFinite(value)) continue;
    const day = new Date(record.ts);
    byDay.set(`${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`, {
      ts: record.ts,
      value,
    });
  }
  return [...byDay.values()].sort((a, b) => a.ts - b.ts);
}

function diffOf(values) {
  const nums = values.filter((value) => Number.isFinite(value));
  if (nums.length < 2) return { diff: null };
  return { diff: nums[nums.length - 1] - nums[nums.length - 2] };
}

function signed(value, decimals) {
  if (Math.abs(value) < 0.005) return "持平";
  return `${value > 0 ? "+" : "−"}${Math.abs(value).toFixed(decimals)}`;
}

function sparkRow({ label, unit, decimals, tone, series, delta, cutoff, now, days }) {
  const top =
    `<div class="spark-top">
       <span class="spark-name">${label}</span>`;
  if (!series.length) {
    return `<div class="spark spark-${tone} spark-empty">
      ${top}<span class="spark-note">近 ${days} 天暂无记录</span></div>
    </div>`;
  }
  const current = series[series.length - 1].value;
  const deltaHtml =
    delta.diff === null
      ? '<span class="spark-delta is-flat">首次记录</span>'
      : `<span class="spark-delta ${delta.diff > 0 ? "is-up" : delta.diff < 0 ? "is-down" : "is-flat"}">较上次 ${signed(delta.diff, decimals)} ${unit}</span>`;

  return `<div class="spark spark-${tone}">
    ${top}
      <span class="spark-value">${current.toFixed(decimals)}<small>${unit}</small></span>
      ${deltaHtml}
    </div>
    ${sparkSvg(series, cutoff, now)}
    <div class="spark-axis"><span>${fmtDay(cutoff)}</span><span>${fmtDay(now)}</span></div>
  </div>`;
}

function sparkSvg(series, cutoff, now) {
  const values = series.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.max(1, Math.abs(max) * 0.02);
  const padX = 10;
  const padY = 12;
  const xOf = (ts) => padX + ((ts - cutoff) / Math.max(1, now - cutoff)) * (TREND_W - padX * 2);
  const yOf = (value) => padY + (1 - (value - min) / span) * (TREND_H - padY * 2);
  const coords = series.map((point) => [xOf(point.ts), yOf(point.value)]);
  const line = coords
    .map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const first = coords[0];
  const last = coords[coords.length - 1];
  const area = `${line} L${last[0].toFixed(1)},${TREND_H - 1} L${first[0].toFixed(1)},${TREND_H - 1} Z`;

  return `<svg class="spark-svg" viewBox="0 0 ${TREND_W} ${TREND_H}" preserveAspectRatio="none" aria-hidden="true">
    <path class="spark-area" d="${area}" />
    <path class="spark-line" d="${line}" vector-effect="non-scaling-stroke" />
    <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3.5" />
  </svg>`;
}

function drawStatus(el) {
  if (state.connected) {
    el.wsPill.className = "pill pill-live";
    el.wsText.textContent = Number.isFinite(state.latency) ? `实时通道 · ${state.latency}ms` : "实时通道";
  } else {
    el.wsPill.className = "pill pill-idle";
    el.wsText.textContent = "连接中";
  }

  el.scalePill.className = state.scale.connected ? "pill pill-ok" : "pill pill-err";
  el.scaleText.textContent = state.scale.connected ? "秤已连接" : "秤离线";
}

function renderAll(el, actions) {
  drawHero(el);
  drawBodyComposition();
  drawMembers(document.getElementById("memberList"), actions);
  drawTrends();
  drawRecords(document.getElementById("recordList"), actions);
  drawStatus(el);
}




const PING_EVERY_MS = 20_000;
let ws = null;
let retry = 0;
let pingTimer = null;
let lastNotice = { text: "", at: 0 };

function send(payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  } else {
    toast("err", "实时通道未连接，正在重连…");
  }
}

function connect(onMessage, onToast) {
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

function handleMessage(data, onToast) {
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
      state.suggestion = data.suggestion || null;
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

function toast(level, text, container) {
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






function openModal(title, bodyHtml, footHtml, layerEl, titleEl, bodyEl, footEl) {
  titleEl.textContent = title;
  bodyEl.innerHTML = bodyHtml;
  footEl.innerHTML = footHtml || "";
  layerEl.hidden = false;
}

function closeModal(layerEl, bodyEl, footEl) {
  layerEl.hidden = true;
  bodyEl.innerHTML = "";
  footEl.innerHTML = "";
}

function openUserModal(user, openModalFn, closeModalFn, modalLayer, modalTitle, modalBody, modalFoot, toastFn) {
  const isEdit = !!user;
  const v = user || { name: "", height_cm: 173, age: 25, sex: "male" };
  openModalFn(
    isEdit ? `编辑 ${v.name}` : "新增成员",
    `<div class="field"><label for="fName">姓名</label>
       <input id="fName" type="text" maxlength="12" autocomplete="off" placeholder="如：我 / 小明" value="${esc(v.name)}"></div>
     <div class="field"><label>身高</label>
       <div class="stepper"><button type="button" data-step="h:-1">−</button>
         <input id="fHeight" type="text" inputmode="numeric" value="${v.height_cm}"><span class="suffix">cm</span>
         <button type="button" data-step="h:1">＋</button></div></div>
     <div class="field"><label>年龄</label>
       <div class="stepper"><button type="button" data-step="a:-1">−</button>
         <input id="fAge" type="text" inputmode="numeric" value="${v.age}"><span class="suffix">岁</span>
         <button type="button" data-step="a:1">＋</button></div></div>
     <div class="field"><label>性别</label>
       <div class="segmented">
         <button type="button" data-sex="male" aria-pressed="${v.sex !== "female"}">男</button>
         <button type="button" data-sex="female" aria-pressed="${v.sex === "female"}">女</button>
       </div></div>
     <p class="modal-note">身高 100–230 cm、年龄 10–100 岁。资料改变后，该成员名下记录的体成分会全部重算。</p>`,
    `<button class="btn btn-ghost" type="button" data-act="cancel">取消</button>
      <button class="btn btn-primary" type="button" data-act="save">${isEdit ? "保存修改" : "创建成员"}</button>`,
    modalLayer,
    modalTitle,
    modalBody,
    modalFoot
  );

  let sex = v.sex === "female" ? "female" : "male";
  modalBody.querySelectorAll("[data-sex]").forEach((node) =>
    node.addEventListener("click", () => {
      sex = node.dataset.sex;
      modalBody.querySelectorAll("[data-sex]").forEach((n) =>
        n.setAttribute("aria-pressed", String(n.dataset.sex === sex))
      );
    })
  );
  modalBody.querySelectorAll("[data-step]").forEach((node) =>
    node.addEventListener("click", () => {
      const [kind, dir] = node.dataset.step.split(":");
      const input = document.getElementById(kind === "h" ? "fHeight" : "fAge");
      const step = kind === "h" ? 1 : 1;
      input.value = clampNum(input.value, kind === "h" ? [100, 230] : [10, 100], step * Number(dir));
    })
  );
  modalFoot.querySelector('[data-act="cancel"]').addEventListener("click", () => closeModalFn(modalLayer, modalBody, modalFoot));
  modalFoot.querySelector('[data-act="save"]').addEventListener("click", () => {
    const name = document.getElementById("fName").value.trim();
    const height_cm = clampNum(document.getElementById("fHeight").value, [100, 230], 0);
    const age = clampNum(document.getElementById("fAge").value, [10, 100], 0);
    if (!name) {
      toastFn("warn", "请填写成员姓名");
      document.getElementById("fName").focus();
      return;
    }
    send({ type: isEdit ? "update_user" : "add_user", id: isEdit ? user.id : undefined, name, height_cm, age, sex });
    closeModalFn(modalLayer, modalBody, modalFoot);
  });
}

function openAssignModal(record, openModalFn, closeModalFn, modalLayer, modalTitle, modalBody, modalFoot, toastFn) {
  if (!record) return;
  if (!state.users.length) {
    toastFn("warn", "还没有成员档案，请先新增成员");
    return;
  }
  openModalFn(
    `归属这条记录 · ${fmtWeight(record.kg)} kg`,
    `<p class="modal-note">秤无法识别「这次是谁」，请手动归档；归属后体成分按该成员资料重算。</p>
     <div class="picker">${state.users
       .map(
         (u) => `<button type="button" data-pick="${esc(u.id)}" aria-pressed="${u.id === record.user_id}"
             style="${colorVars(u.color)}">
           <span class="face">${esc((u.name || "?").slice(0, 1))}</span>
           <span>${esc(u.name)}<span style="color:#7a7a7a;font-weight:400;font-size:14px"> · ${u.height_cm}cm ${u.age}岁</span></span>
         </button>`
       )
       .join("")}
       <button type="button" data-pick="" style="--mc:#7a7a7a"><span class="face">×</span><span>取消归属</span></button>
     </div>`,
    `<button class="btn btn-ghost" type="button" data-act="cancel">关闭</button>`,
    modalLayer,
    modalTitle,
    modalBody,
    modalFoot
  );
  modalBody.querySelectorAll("[data-pick]").forEach((node) =>
    node.addEventListener("click", () => {
      send({ type: "assign_record", record_id: record.id, user_id: node.dataset.pick || null });
      closeModalFn(modalLayer, modalBody, modalFoot);
    })
  );
  modalFoot.querySelector('[data-act="cancel"]').addEventListener("click", () => closeModalFn(modalLayer, modalBody, modalFoot));
}

function openDeleteRecord(record, openModalFn, closeModalFn, modalLayer, modalTitle, modalBody, modalFoot) {
  if (!record) return;
  openModalFn(
    "删除这条记录？",
    `<p class="modal-note"><b>${esc(fmtStamp(record.ts))}</b> · <b>${fmtWeight(record.kg)} kg</b>${
      record.user_name ? ` · ${esc(record.user_name)}` : ""
    }<br>删除后不可恢复，趋势图与统计会同步更新。</p>`,
    `<button class="btn btn-ghost" type="button" data-act="cancel">取消</button>
      <button class="btn btn-danger" type="button" data-act="ok">删除记录</button>`,
    modalLayer,
    modalTitle,
    modalBody,
    modalFoot
  );
  modalFoot.querySelector('[data-act="cancel"]').addEventListener("click", () => closeModalFn(modalLayer, modalBody, modalFoot));
  modalFoot.querySelector('[data-act="ok"]').addEventListener("click", () => {
    send({ type: "delete_record", record_id: record.id });
    if (state.selectedId === record.id) state.selectedId = null;
    closeModalFn(modalLayer, modalBody, modalFoot);
  });
}

function openDeleteUser(user, openModalFn, closeModalFn, modalLayer, modalTitle, modalBody, modalFoot) {
  const count = state.records.filter((r) => r.user_id === user.id).length;
  openModalFn(
    `删除成员 ${user.name}？`,
    `<p class="modal-note">${
      count
        ? `该成员名下还有 <b>${count}</b> 条记录。请先把记录改归属到其他成员，否则服务端会拒绝删除。`
        : "该成员还没有记录，删除不影响历史数据。"
    }</p>`,
    `<button class="btn btn-ghost" type="button" data-act="cancel">取消</button>
      <button class="btn btn-danger" type="button" data-act="ok" ${count ? "disabled" : ""}>删除成员</button>`,
    modalLayer,
    modalTitle,
    modalBody,
    modalFoot
  );
  modalFoot.querySelector('[data-act="cancel"]').addEventListener("click", () => closeModalFn(modalLayer, modalBody, modalFoot));
  const ok = modalFoot.querySelector('[data-act="ok"]');
  if (ok && !count)
    ok.addEventListener("click", () => {
      send({ type: "delete_user", id: user.id });
      if (state.filterUser === user.id) state.filterUser = null;
      closeModalFn(modalLayer, modalBody, modalFoot);
    });
}

function clampNum(raw, [min, max], delta) {
  const base = Number(String(raw).replace(/[^\d.-]/g, ""));
  const value = Number.isFinite(base) ? (delta ? base + delta : base) : (min + max) / 2;
  return Math.min(max, Math.max(min, Math.round(value)));
}

// Three.js 动态效果 - 粒子光环系统
let scene, camera, renderer;
let particles, rings = [];
let animationId;

function initThreeEffects() {
  const canvas = document.getElementById('threeCanvas');
  if (!canvas) {
    console.error('Canvas element not found');
    return;
  }

  // 创建场景
  scene = new THREE.Scene();
  scene.background = null; // 透明背景

  // 创建相机
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.z = 5;

  // 创建渲染器
  renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    alpha: true,
    antialias: true
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  // 创建粒子系统
  createParticles();

  // 创建光环
  createRings();

  // 窗口大小调整
  window.addEventListener('resize', onWindowResize);

  // 开始动画
  animate();
}

function createParticles() {
  const particleCount = 150;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  const sizes = new Float32Array(particleCount);

  for (let i = 0; i < particleCount; i++) {
    const i3 = i * 3;
    
    // 在中心圆周围随机分布粒子
    const radius = 2 + Math.random() * 2;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    
    positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[i3 + 2] = radius * Math.cos(phi);

    // 蓝色系粒子
    const color = new THREE.Color();
    color.setHSL(0.55 + Math.random() * 0.1, 0.8, 0.5 + Math.random() * 0.3);
    colors[i3] = color.r;
    colors[i3 + 1] = color.g;
    colors[i3 + 2] = color.b;

    sizes[i] = Math.random() * 0.05 + 0.02;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  // 创建粒子材质
  const material = new THREE.PointsMaterial({
    size: 0.05,
    vertexColors: true,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  particles = new THREE.Points(geometry, material);
  scene.add(particles);
}

function createRings() {
  // 创建多个旋转光环
  for (let i = 0; i < 3; i++) {
    const geometry = new THREE.TorusGeometry(2.5 + i * 0.3, 0.02, 16, 100);
    const material = new THREE.MeshBasicMaterial({
      color: 0x0066cc,
      transparent: true,
      opacity: 0.15 - i * 0.03,
      side: THREE.DoubleSide
    });
    
    const ring = new THREE.Mesh(geometry, material);
    ring.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.5;
    ring.rotation.y = Math.random() * Math.PI;
    ring.userData = {
      rotationSpeed: 0.001 + Math.random() * 0.002,
      initialRotation: ring.rotation.clone()
    };
    
    scene.add(ring);
    rings.push(ring);
  }
}

function animate() {
  animationId = requestAnimationFrame(animate);

  // 粒子旋转
  if (particles) {
    particles.rotation.y += 0.002;
    particles.rotation.x += 0.001;
    
    // 粒子波动效果
    const positions = particles.geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      
      const distance = Math.sqrt(x * x + y * y + z * z);
      const wave = Math.sin(Date.now() * 0.001 + distance) * 0.1;
      
      positions[i] += wave * 0.01;
      positions[i + 1] += wave * 0.01;
      positions[i + 2] += wave * 0.01;
    }
    particles.geometry.attributes.position.needsUpdate = true;
  }

  // 光环旋转
  rings.forEach((ring, index) => {
    ring.rotation.z += ring.userData.rotationSpeed;
    ring.rotation.x += ring.userData.rotationSpeed * 0.5;
    
    // 光环呼吸效果
    const scale = 1 + Math.sin(Date.now() * 0.001 + index) * 0.05;
    ring.scale.set(scale, scale, scale);
  });

  renderer.render(scene, camera);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
}

function stopThreeEffects() {
  if (animationId) {
    cancelAnimationFrame(animationId);
  }
  
  if (renderer) {
    renderer.dispose();
  }
  
  window.removeEventListener('resize', onWindowResize);
}

// 导出以便在 main.js 中使用








const $ = (id) => document.getElementById(id);

let el;

function initElements() {
  el = {
    clockTime: $("clockTime"), clockDate: $("clockDate"),
    wsPill: $("wsPill"), wsText: $("wsText"), scalePill: $("scalePill"), scaleText: $("scaleText"),
    weightValue: $("weightValue"), weightTime: $("weightTime"),
    memberList: $("memberList"), recordList: $("recordList"), addUserBtn: $("addUserBtn"),
    metricsDrawer: $("metricsDrawer"), drawerToggle: $("drawerToggle"), themeToggle: $("themeToggle"),
    modalLayer: $("modalLayer"), modalTitle: $("modalTitle"), modalBody: $("modalBody"),
    modalFoot: $("modalFoot"), modalClose: $("modalClose"), toasts: $("toasts"),
  };
}

function toastFn(level, text) {
  toast(level, text, el.toasts);
}

const actions = {
  refresh() {
    renderAll(el, actions);
  },
  assignRecord(record) {
    openAssignModal(record, openModal, closeModal, el.modalLayer, el.modalTitle, el.modalBody, el.modalFoot, toastFn);
  },
  deleteRecord(record) {
    openDeleteRecord(record, openModal, closeModal, el.modalLayer, el.modalTitle, el.modalBody, el.modalFoot);
  },
  deleteUser(user) {
    openDeleteUser(user, openModal, closeModal, el.modalLayer, el.modalTitle, el.modalBody, el.modalFoot);
  },
  editUser(user) {
    openUserModal(user, openModal, closeModal, el.modalLayer, el.modalTitle, el.modalBody, el.modalFoot, toastFn);
  },
  notify(level, text) {
    toastFn(level, text);
  },
  assignSuggested(recordId, userId, userName) {
    send({ type: "assign_record", record_id: recordId, user_id: userId });
    toastFn("ok", `已归属给 ${userName}`);
  },
};

function tickClock() {
  const now = new Date();
  el.clockTime.textContent = fmtClock(now);
  el.clockDate.textContent = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")} 周${"日一二三四五六"[now.getDay()]}`;
}

function applyTheme(theme, persist = false) {
  const isDark = theme === "dark";
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  $("themeColor").content = isDark ? "#000000" : "#f5f5f7";
  el.themeToggle.setAttribute("aria-pressed", String(isDark));
  el.themeToggle.setAttribute("aria-label", isDark ? "切换浅色模式" : "切换深色模式");
  el.themeToggle.title = isDark ? "切换浅色模式" : "切换深色模式";
  if (persist) localStorage.setItem("antaf-theme", isDark ? "dark" : "light");
}

function setDrawerOpen(open) {
  el.metricsDrawer.classList.toggle("open", open);
  el.drawerToggle.classList.toggle("is-open", open);
  el.metricsDrawer.setAttribute("aria-hidden", String(!open));
  el.drawerToggle.setAttribute("aria-expanded", String(open));
  el.drawerToggle.setAttribute("aria-label", open ? "收起详细指标" : "查看详细指标");
  el.drawerToggle.title = open ? "收起详细指标" : "查看详细指标";
}

function onMessage(data) {
  handleMessage(data, toastFn);
  renderAll(el, actions);
}

document.addEventListener("DOMContentLoaded", () => {
  initElements();
  applyTheme(document.documentElement.dataset.theme || "light");

  el.themeToggle.addEventListener("click", () => {
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark", true);
  });

  document.querySelectorAll("[data-range]").forEach((button) => {
    button.addEventListener("click", () => {
      state.trendRange = Number(button.dataset.range) === 30 ? 30 : 7;
      renderAll(el, actions);
    });
  });

  el.addUserBtn.addEventListener("click", () => {
    openUserModal(null, openModal, closeModal, el.modalLayer, el.modalTitle, el.modalBody, el.modalFoot, toastFn);
  });

  el.drawerToggle.addEventListener("click", () => {
    setDrawerOpen(!el.metricsDrawer.classList.contains("open"));
  });

  document.addEventListener("click", (event) => {
    if (!el.metricsDrawer.contains(event.target) && !el.drawerToggle.contains(event.target)) {
      setDrawerOpen(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!el.modalLayer.hidden) closeModal(el.modalLayer, el.modalBody, el.modalFoot);
    setDrawerOpen(false);
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      tickClock();
      renderAll(el, actions);
    }
  });

  el.modalClose.addEventListener("click", () => closeModal(el.modalLayer, el.modalBody, el.modalFoot));
  el.modalLayer.addEventListener("click", (event) => {
    if (event.target === el.modalLayer) closeModal(el.modalLayer, el.modalBody, el.modalFoot);
  });

  try {
    if (typeof THREE !== "undefined") initThreeEffects();
  } catch (error) {
    console.warn("3D 背景不可用，已保留基础仪表盘。", error);
  }

  connect(onMessage, toastFn);
  tickClock();
  setInterval(tickClock, 1_000);
  renderAll(el, actions);
});

window.__antaf = { push: onMessage, state, send };

