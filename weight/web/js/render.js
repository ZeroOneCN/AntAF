import { state, view, bodyOf } from "./state.js";
import { esc, num, fmtWeight, fmtMoment, fmtStamp, fmtDay, colorVars } from "./utils.js";

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

export function drawHero(el) {
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

export function drawBodyComposition() {
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

export function drawMembers(el, actions) {
  el.innerHTML = "";

  const pending = state.records[0] && !state.records[0].user_id ? state.records[0] : null;

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

  if (pending) {
    const discard = document.createElement("button");
    discard.type = "button";
    discard.className = "member-chip member-discard";
    discard.title = `放弃这条测量：${fmtWeight(pending.kg)} kg · ${fmtMoment(pending.ts)}`;
    discard.setAttribute("aria-label", discard.title);
    discard.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg><span class="discard-label">放弃本次</span>`;
    discard.addEventListener("click", () => actions.discardRecord(pending));
    el.appendChild(discard);
  }

  if (!state.users.length) {
    const empty = document.createElement("div");
    empty.className = "list-empty";
    empty.textContent = "暂无成员，点击右侧按钮添加";
    el.appendChild(empty);
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

export function drawRecords(el, actions) {
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

export function drawTrends() {
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

export function drawStatus(el) {
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

export function renderAll(el, actions) {
  drawHero(el);
  drawBodyComposition();
  drawMembers(document.getElementById("memberList"), actions);
  drawTrends();
  drawRecords(document.getElementById("recordList"), actions);
  drawStatus(el);
}
