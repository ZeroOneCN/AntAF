import { state, view, bodyOf } from "./state.js";
import { esc, num, fmtWeight, ago, colorVars, GRADE_TONE } from "./utils.js";

const METRICS = [
  { key: "bmi", label: "BMI", unit: "", d: 1, band: "bmi" },
  { key: "body_fat", label: "体脂率", unit: "%", d: 1, band: "body_fat" },
  { key: "visceral_fat", label: "内脏脂肪", unit: "级", d: 0, band: "visceral_fat" },
  { key: "muscle", label: "肌肉量", unit: "kg", d: 1, band: "muscle" },
  { key: "fat_mass", label: "体脂量", unit: "kg", d: 1, band: "fat_mass" },
  { key: "sub_fat_pct", label: "皮下脂肪率", unit: "%", d: 1, band: "sub_fat" },
  { key: "sub_fat_mass", label: "皮下脂肪量", unit: "kg", d: 1, band: "sub_fat" },
  { key: "water", label: "水分率", unit: "%", d: 1, band: "water" },
  { key: "water_mass", label: "水分量", unit: "kg", d: 1, band: "water_mass" },
  { key: "protein_rate", label: "蛋白质率", unit: "%", d: 1, band: "protein" },
  { key: "protein_mass", label: "蛋白质量", unit: "kg", d: 1, band: "protein" },
  { key: "bone", label: "骨量", unit: "kg", d: 2, band: "bone" },
  { key: "bone_rate", label: "骨量率", unit: "%", d: 1, band: "bone" },
  { key: "muscle_rate", label: "肌肉率", unit: "%", d: 1, band: "muscle_rate" },
  { key: "skeletal_muscle", label: "骨骼肌量", unit: "kg", d: 1, band: "skeletal_muscle" },
  { key: "skeletal_muscle_rate", label: "骨骼肌率", unit: "%", d: 1, band: "skeletal_muscle_rate" },
  { key: "lean_mass", label: "去脂体重", unit: "kg", d: 1, band: "" },
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
    el.weightTime.textContent = `上次测量 · ${ago(rec.ts)}`;
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
    return;
  }

  // Show orbit cards
  document.getElementById("cardBMI").hidden = false;
  document.getElementById("cardFat").hidden = false;
  document.getElementById("cardMuscle").hidden = false;
  document.getElementById("cardWater").hidden = false;

  // BMI
  document.getElementById("bmiValue").textContent = num(body.bmi, 1);
  const bmiGradeEl = document.getElementById("bmiGrade");
  bmiGradeEl.textContent = gradeText(METRICS[0], body);
  bmiGradeEl.dataset.tone = gradeTone(METRICS[0], body);

  // Body fat
  document.getElementById("fatValue").innerHTML = `${num(body.body_fat, 1)}<small class="orbit-unit">%</small>`;
  const fatGradeEl = document.getElementById("fatGrade");
  fatGradeEl.textContent = gradeText(METRICS[1], body);
  fatGradeEl.dataset.tone = gradeTone(METRICS[1], body);

  // Muscle
  document.getElementById("muscleValue").innerHTML = `${num(body.muscle, 1)}<small class="orbit-unit">kg</small>`;
  const muscleGradeEl = document.getElementById("muscleGrade");
  muscleGradeEl.textContent = gradeText(METRICS[3], body);
  muscleGradeEl.dataset.tone = gradeTone(METRICS[3], body);

  // Water
  document.getElementById("waterValue").innerHTML = `${num(body.water, 1)}<small class="orbit-unit">%</small>`;
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

export function drawMembers(el, send) {
  el.innerHTML = "";

  if (!state.users.length) {
    el.innerHTML = '<div style="padding: var(--space-md); color: var(--ink-muted-48); font-size: 14px;">暂无成员，点击右下角按钮添加</div>';
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
    const latest = state.records.find(r => r.user_id === user.id);
    info.innerHTML = `<b>${esc(user.name)}</b><span>${latest ? fmtWeight(latest.kg) + " · " + ago(latest.ts) : "无记录"}</span>`;

    chip.appendChild(avatar);
    chip.appendChild(info);

    chip.addEventListener("click", () => {
      if (state.filterUser === user.id) {
        state.filterUser = null;
      } else {
        state.filterUser = user.id;
      }
      drawMembers(el, send);
      drawRecords(document.getElementById("recordList"), send);
    });

    el.appendChild(chip);
  });
}

export function drawRecords(el, send) {
  el.innerHTML = "";

  let records = [...state.records];
  if (state.filterUser) {
    records = records.filter(r => r.user_id === state.filterUser);
  }

  if (!records.length) {
    el.innerHTML = '<div style="padding: var(--space-md); color: var(--ink-muted-48); font-size: 14px; text-align: center;">暂无记录</div>';
    return;
  }

  records.slice(0, 50).forEach((rec) => {
    const row = document.createElement("button");
    row.className = `record ${state.selectedId === rec.id ? "is-active" : ""}`;
    row.type = "button";

    const time = document.createElement("span");
    time.className = "time";
    time.textContent = ago(rec.ts);

    const kg = document.createElement("span");
    kg.className = "kg";
    kg.innerHTML = `${fmtWeight(rec.kg)}<small>kg</small>`;

    const owner = document.createElement("span");
    owner.className = "owner";
    if (rec.user_name) {
      const user = state.users.find(u => u.id === rec.user_id);
      owner.innerHTML = `<i class="bead" style="--mc: ${user?.color || "#999"}"></i>${esc(rec.user_name)}`;
    } else {
      owner.innerHTML = '<em class="none">未归属</em>';
    }

    const flags = document.createElement("span");
    flags.className = "flags";
    if (rec.impedance) {
      flags.innerHTML = `<span class="mini on">${num(rec.impedance, 0)}Ω</span>`;
    }

    row.appendChild(time);
    row.appendChild(kg);
    row.appendChild(owner);
    row.appendChild(flags);

    row.addEventListener("click", () => {
      state.selectedId = rec.id;
      drawRecords(el, send);
    });

    el.appendChild(row);
  });
}

export function drawStatus(el) {
  const { connected, latency } = state.scale;

  if (connected) {
    el.wsPill.className = "pill pill-live";
    el.wsText.textContent = `实时通道 · ${latency}ms`;
    el.scalePill.className = "pill pill-ok";
    el.scaleText.textContent = "秤已连接";
  } else {
    el.wsPill.className = "pill pill-idle";
    el.wsText.textContent = "连接中";
    el.scalePill.className = "pill pill-err";
    el.scaleText.textContent = "秤离线";
  }
}

export function renderAll(el) {
  drawHero(el);
  drawBodyComposition();
  drawMembers(document.getElementById("memberList"));
  drawRecords(document.getElementById("recordList"));
  drawStatus(el);
}
