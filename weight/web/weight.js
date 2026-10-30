(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const els = {
    wsBadge: $("wsBadge"),
    wsText: $("wsText"),
    scaleBadge: $("scaleBadge"),
    scaleText: $("scaleText"),
    themeBtn: $("themeBtn"),
    themeIcon: $("themeIcon"),
    fullscreenBtn: $("fullscreenBtn"),
    weightState: $("weightState"),
    weightStateText: $("weightStateText"),
    weightValue: $("weightValue"),
    weightHint: $("weightHint"),
    weightDevice: $("weightDevice"),
    weightRaw: $("weightRaw"),
    weightImpedance: $("weightImpedance"),
    weightTime: $("weightTime"),
    assignState: $("assignState"),
    assignChips: $("assignChips"),
    addUserBtn: $("addUserBtn"),
    userList: $("userList"),
    recordCount: $("recordCount"),
    recordList: $("recordList"),
    compContext: $("compContext"),
    compCount: $("compCount"),
    compGrid: $("compGrid"),
    compEmpty: $("compEmpty"),
    modalLayer: $("modalLayer"),
    modalTitle: $("modalTitle"),
    modalClose: $("modalClose"),
    modalBody: $("modalBody"),
    modalFoot: $("modalFoot"),
    toasts: $("toasts"),
  };

  /**
   * 体成分指标定义：key 对应后端返回字段，gradeKey 对应 grades 中的等级字段。
   * primary 为 true 的核心指标会使用主色高亮。
   */
  const COMP_ITEMS = [
    { key: "bmi", label: "BMI", unit: "", gradeKey: null, primary: true },
    { key: "body_fat", label: "体脂率", unit: "%", gradeKey: "body_fat", primary: true },
    { key: "fat_mass", label: "脂肪量", unit: "kg", gradeKey: "fat_mass" },
    { key: "visceral_fat", label: "内脏脂肪等级", unit: "级", gradeKey: "visceral_fat" },
    { key: "sub_fat_pct", label: "皮下脂肪率", unit: "%", gradeKey: "sub_fat" },
    { key: "sub_fat_mass", label: "皮下脂肪量", unit: "kg", gradeKey: null },
    { key: "water", label: "体水分率", unit: "%", gradeKey: "water" },
    { key: "water_mass", label: "体水份量", unit: "kg", gradeKey: "water_mass" },
    { key: "protein_mass", label: "蛋白质含量", unit: "kg", gradeKey: "protein" },
    { key: "protein_rate", label: "蛋白质占比", unit: "%", gradeKey: null },
    { key: "bone", label: "骨量", unit: "kg", gradeKey: "bone" },
    { key: "bone_rate", label: "骨量占比", unit: "%", gradeKey: null },
    { key: "muscle", label: "肌肉量", unit: "kg", gradeKey: "muscle", primary: true },
    { key: "muscle_rate", label: "肌肉率", unit: "%", gradeKey: "muscle_rate" },
    { key: "skeletal_muscle", label: "骨骼肌量", unit: "kg", gradeKey: "skeletal_muscle" },
    { key: "skeletal_muscle_rate", label: "骨骼肌率", unit: "%", gradeKey: "skeletal_muscle_rate" },
    { key: "bmr", label: "基础代谢", unit: "kcal", gradeKey: null, primary: true },
    { key: "lean_mass", label: "去脂体重", unit: "kg", gradeKey: null },
  ];

  const ICONS = {
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10-10-4-4-10 10z"/><path d="M14 6l4 4"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13"/></svg>',
    assign: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M17 8h5M19.5 5.5v5"/></svg>',
  };

  const state = {
    ws: null,
    reconnectDelay: 1000,
    users: [],
    records: [],
    version: 0,
    live: null,
    liveTs: 0,
    selectedId: null,
    devices: new Map(),
    scaleEnabled: true,
    scaleConnected: false,
    scaleError: null,
    editingUserId: null,
  };

  /* ---------------- 工具函数 ---------------- */

  /**
   * 对文本做 HTML 转义，避免成员姓名等输入破坏结构。
   * @param {*} value 原始文本
   * @returns {string} 转义后的文本
   */
  function esc(value) {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return String(value ?? "").replace(/[&<>"']/g, (ch) => map[ch]);
  }

  /**
   * 格式化时钟时间为 HH:MM:SS。
   * @param {number} ts 毫秒时间戳
   * @returns {string} 时间文本
   */
  function formatClock(ts) {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, "0");
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  /**
   * 格式化日期为 HH:MM，非今天时补上 MM-DD。
   * @param {number} ts 毫秒时间戳
   * @returns {{time:string, day:string}} 时间与日期文本
   */
  function formatStamp(ts) {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, "0");
    const today = new Date();
    const sameDay =
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate();
    return {
      time: `${p(d.getHours())}:${p(d.getMinutes())}`,
      day: sameDay ? "今天" : `${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    };
  }

  /**
   * 将数值格式化为最多两位小数并去掉末尾多余的零。
   * @param {number} value 原始数值
   * @param {number} [digits=2] 最大小数位数
   * @returns {string} 格式化后的文本
   */
  function formatNumber(value, digits = 2) {
    if (!Number.isFinite(value)) return "--";
    return Number(value.toFixed(digits)).toString();
  }

  /**
   * 体重固定两位小数展示（秤原始精度到 10 g）。
   * @param {number} kg 体重（千克）
   * @returns {string} 体重文本
   */
  function formatWeight(kg) {
    return Number.isFinite(kg) ? kg.toFixed(2) : "--";
  }

  /**
   * 取成员姓名首字作为头像文字。
   * @param {string} name 成员姓名
   * @returns {string} 头像文字
   */
  function initial(name) {
    const text = String(name || "").trim();
    return text ? text.slice(0, 1).toUpperCase() : "?";
  }

  /**
   * 取成员配色样式变量。
   * @param {object|null} user 成员
   * @returns {string} 样式片段
   */
  function userColorStyle(user) {
    return user && user.color ? ` style="--user-color:${esc(user.color)}"` : "";
  }

  /**
   * 按 ID 查找成员。
   * @param {string|null} userId 成员 ID
   * @returns {object|null} 成员对象
   */
  function findUser(userId) {
    if (!userId) return null;
    return state.users.find((user) => user.id === userId) || null;
  }

  /**
   * 按 ID 查找记录。
   * @param {string|null} recordId 记录 ID
   * @returns {object|null} 记录对象
   */
  function findRecord(recordId) {
    if (!recordId) return null;
    return state.records.find((record) => record.id === recordId) || null;
  }

  /**
   * 弹出自动关闭的提示条。
   * @param {string} message 提示内容
   * @param {"info"|"ok"|"warn"|"err"} kind 提示类型
   * @param {number} [duration=3000] 显示时长（毫秒）
   */
  function showToast(message, kind = "info", duration = 3000) {
    const node = document.createElement("div");
    node.className = `toast ${kind}`;
    node.textContent = message;
    els.toasts.appendChild(node);
    window.setTimeout(() => {
      node.classList.add("out");
      window.setTimeout(() => node.remove(), 220);
    }, duration);
  }

  /**
   * 把等级文案映射为样式类。
   * @param {string|null} grade 等级文案
   * @returns {string} 样式类名
   */
  function gradeClass(grade) {
    if (!grade) return "";
    if (grade === "优秀" || grade === "标准") return "is-ok";
    if (grade === "偏高" || grade === "高" || grade === "过高") return "is-high";
    return "is-low";
  }

  /* ---------------- 主题 ---------------- */

  /**
   * 根据当前主题更新按钮图标与提示文案。
   */
  function updateThemeIcon() {
    const dark = document.documentElement.dataset.theme === "dark";
    els.themeIcon.innerHTML = dark
      ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'
      : '<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/>';
    els.themeBtn.title = dark ? "切换到浅色" : "切换到深色";
  }

  /**
   * 应用主题并写入本地偏好。
   * @param {"light"|"dark"} theme 主题名
   */
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("antaf-theme", theme);
    updateThemeIcon();
  }

  /**
   * 绑定主题切换按钮。
   */
  function setupTheme() {
    updateThemeIcon();
    els.themeBtn.addEventListener("click", () => {
      const dark = document.documentElement.dataset.theme === "dark";
      applyTheme(dark ? "light" : "dark");
    });
  }

  /**
   * 绑定全屏按钮，便于在 iPad 上铺满屏幕展示。
   */
  function setupFullscreen() {
    els.fullscreenBtn.addEventListener("click", async () => {
      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        } else {
          await document.documentElement.requestFullscreen();
        }
      } catch (error) {
        showToast("当前浏览器不支持网页全屏，可旋转 iPad 横屏使用", "warn");
      }
    });
    document.addEventListener("fullscreenchange", () => {
      els.fullscreenBtn.title = document.fullscreenElement ? "退出全屏" : "全屏显示";
    });
  }

  /* ---------------- WebSocket ---------------- */

  /**
   * 建立 WebSocket 连接，断线后按退避策略自动重连。
   */
  function connectWS() {
    if (
      state.ws &&
      (state.ws.readyState === WebSocket.OPEN ||
        state.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    setWsBadge("wait", "连接中");
    const ws = new WebSocket(`${scheme}://${location.host}/ws`);
    state.ws = ws;

    ws.addEventListener("open", () => {
      state.reconnectDelay = 1000;
      setWsBadge("ok", "已连接");
    });

    ws.addEventListener("message", (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch (error) {
        return;
      }
      handleMessage(data);
    });

    ws.addEventListener("close", () => {
      setWsBadge("err", "已断开");
      window.setTimeout(connectWS, state.reconnectDelay);
      state.reconnectDelay = Math.min(state.reconnectDelay * 1.7, 10000);
    });

    ws.addEventListener("error", () => {
      setWsBadge("err", "连接失败");
    });
  }

  /**
   * 更新连接状态徽标。
   * @param {"wait"|"ok"|"err"} kind 状态类型
   * @param {string} text 状态文本
   */
  function setWsBadge(kind, text) {
    els.wsBadge.className = `badge badge-${kind}`;
    els.wsText.textContent = text;
  }

  /**
   * 向服务端发送 JSON 指令。
   * @param {object} payload 指令内容
   */
  function send(payload) {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify(payload));
    } else {
      showToast("连接已断开，请稍后重试", "warn");
    }
  }

  /**
   * 处理服务端推送的消息。
   * @param {object} msg 消息体
   */
  function handleMessage(msg) {
    if (msg.type === "devices") {
      state.devices = new Map(
        (msg.devices || []).map((device) => [device.address, device])
      );
      const scale = msg.scale || {};
      state.scaleEnabled = Boolean(scale.enabled);
      state.scaleConnected = Boolean(scale.connected);
      state.scaleError = scale.error || null;
      if (msg.weight) applyLive(msg.weight);
      renderScaleBadge();
      renderHero();
    } else if (msg.type === "weight") {
      applyLive(msg);
    } else if (msg.type === "weight_state") {
      applyStore(msg);
    } else if (msg.type === "notice") {
      showToast(msg.text, msg.level || "info");
    }
  }

  /* ---------------- 数据更新 ---------------- */

  /**
   * 接收一次实时测量事件。
   * @param {object} event 测量事件
   */
  function applyLive(event) {
    if (!event || !Number.isFinite(event.kg)) return;
    const ts = event.ts || 0;
    if (ts && ts === state.liveTs) return;
    state.liveTs = ts;
    state.live = event;
    renderHero();
  }

  /**
   * 接收成员档案与记录快照。
   * @param {object} msg 状态消息
   */
  function applyStore(msg) {
    const prevLatest = state.records.length ? state.records[0].id : null;
    state.users = Array.isArray(msg.users) ? msg.users : [];
    state.records = Array.isArray(msg.records) ? msg.records : [];
    state.version = msg.version ?? state.version;
    const latest = state.records.length ? state.records[0].id : null;
    const stillExists = state.selectedId && state.records.some((r) => r.id === state.selectedId);
    // 仅当之前跟随最新记录时才自动跳到新记录，避免打断用户查看历史
    if (!stillExists || state.selectedId === prevLatest) {
      state.selectedId = latest;
    }
    renderAll();
  }

  /* ---------------- 渲染：实时测量 ---------------- */

  /**
   * 取当前用于展示的读数（优先实时事件，其次最新记录）。
   * @returns {object|null} 读数对象
   */
  function currentReading() {
    if (state.live && Number.isFinite(state.live.kg)) return state.live;
    return state.records.length ? state.records[0] : null;
  }

  /**
   * 渲染实时测量卡片（数值、徽标、元信息与归属面板）。
   */
  function renderHero() {
    const reading = currentReading();
    const latest = state.records.length ? state.records[0] : null;

    if (!reading) {
      els.weightValue.textContent = "--";
      els.weightValue.className = "weight-value idle";
      setWeightBadge("wait", "等待称重");
      els.weightHint.textContent = state.scaleEnabled
        ? "踩一下秤唤醒它，再光脚站上去称重。"
        : "体重秤读取已在服务端禁用（--no-scale）。";
      els.weightDevice.textContent = "--";
      els.weightRaw.textContent = "--";
      els.weightImpedance.textContent = "--";
      els.weightTime.textContent = "--";
      renderAssign(latest);
      return;
    }

    const stable = reading.stable !== false;
    const impedance = reading.impedance ?? latest?.impedance ?? null;
    els.weightValue.textContent = formatWeight(reading.kg);
    els.weightValue.className = `weight-value${stable ? "" : " weighing"}`;

    if (!stable) {
      setWeightBadge("wait", "称重中");
      els.weightHint.textContent = "请站稳，保持不动直到数值稳定。";
    } else if (impedance) {
      setWeightBadge("ok", "测量完成");
    } else {
      setWeightBadge("wait", "仅体重");
    }

    if (stable) {
      const owner = latest && latest.user_id ? latest.user_name : null;
      if (owner && latest.body) {
        els.weightHint.textContent = `已归属到 ${owner}，体成分按该成员资料估算。`;
      } else if (owner) {
        els.weightHint.textContent = `已归属到 ${owner}，本次未测到阻抗，仅有体重。`;
      } else if (impedance) {
        els.weightHint.textContent = "测量完成，在右侧选择成员后即按该资料估算体成分。";
      } else {
        els.weightHint.textContent = "未测到阻抗，请光脚并保持双脚接触金属电极；本条记录仅有体重。";
      }
    }

    els.weightDevice.textContent =
      reading.device || deviceName(reading.address) || "--";
    els.weightRaw.textContent = Number.isFinite(reading.grams)
      ? `${reading.grams} g`
      : "--";
    els.weightImpedance.textContent = impedance
      ? `${formatNumber(impedance, 1)} Ω`
      : "未测到";
    els.weightTime.textContent = reading.ts ? formatClock(reading.ts) : "--";
    renderAssign(latest);
  }

  /**
   * 按地址取设备名。
   * @param {string|null} address 设备地址
   * @returns {string} 设备名称
   */
  function deviceName(address) {
    if (!address) return "";
    const device = state.devices.get(address);
    return device && device.name ? device.name : address;
  }

  /**
   * 更新测量状态徽标。
   * @param {"wait"|"ok"|"err"} kind 状态类型
   * @param {string} text 状态文本
   */
  function setWeightBadge(kind, text) {
    els.weightState.className = `badge badge-${kind}`;
    els.weightStateText.textContent = text;
  }

  /**
   * 更新体重秤连接状态徽标。
   */
  function renderScaleBadge() {
    if (!state.scaleEnabled) {
      els.scaleBadge.className = "badge badge-err";
      els.scaleText.textContent = "秤已禁用";
      return;
    }
    if (state.scaleConnected) {
      els.scaleBadge.className = "badge badge-ok";
      els.scaleText.textContent = "秤已连接";
      return;
    }
    els.scaleBadge.className = "badge badge-wait";
    els.scaleText.textContent = state.scaleError ? "秤异常" : "秤离线";
    els.scaleBadge.title = state.scaleError || "";
  }

  /**
   * 渲染本次测量的归属状态与成员快捷选择。
   * @param {object|null} latest 最新记录
   */
  function renderAssign(latest) {
    els.assignChips.innerHTML = "";

    if (latest && latest.user_id) {
      const user = findUser(latest.user_id);
      els.assignState.textContent = latest.user_name || "已归属";
      els.assignState.className = "assign-state";
      els.assignState.style.color = user && user.color ? user.color : "";
      els.assignState.style.borderColor = user && user.color ? user.color : "";
    } else if (latest) {
      els.assignState.textContent = "待分配";
      els.assignState.className = "assign-state is-empty";
      els.assignState.style.color = "";
      els.assignState.style.borderColor = "";
    } else {
      els.assignState.textContent = "暂无记录";
      els.assignState.className = "assign-state is-empty";
      els.assignState.style.color = "";
      els.assignState.style.borderColor = "";
    }

    const chips = state.users.map((user) => {
      const active = latest && latest.user_id === user.id;
      return (
        `<button class="user-chip${active ? " is-active" : ""}" type="button"` +
        ` data-user-id="${esc(user.id)}"${userColorStyle(user)}>` +
        `<span class="chip-avatar">${esc(initial(user.name))}</span>` +
        `<span class="chip-name">${esc(user.name)}</span>` +
        `<span class="chip-meta">${esc(user.height_cm)}cm · ${esc(user.age)}</span>` +
        `<span class="chip-mark">✓</span>` +
        `</button>`
      );
    });
    chips.push(
      '<button class="chip-add" type="button" data-add-user="1">+ 新增成员</button>'
    );
    els.assignChips.innerHTML = chips.join("");
  }

  /* ---------------- 渲染：成员 ---------------- */

  /**
   * 渲染成员档案列表。
   */
  function renderUsers() {
    if (!state.users.length) {
      els.userList.innerHTML =
        '<li class="empty-line">暂无成员，点击右上角「新增成员」创建档案。</li>';
      return;
    }
    els.userList.innerHTML = state.users
      .map((user) => {
        const sex = user.sex === "female" ? "女" : "男";
        return (
          `<li class="user-row" data-user-id="${esc(user.id)}"${userColorStyle(user)}>` +
          `<span class="avatar">${esc(initial(user.name))}</span>` +
          `<div class="user-info">` +
          `<div class="user-name">${esc(user.name)}</div>` +
          `<div class="user-meta">${esc(user.height_cm)} cm · ${esc(user.age)} 岁 · ${sex}</div>` +
          `</div>` +
          `<div class="row-actions">` +
          `<button class="icon-btn" type="button" data-act="edit" title="编辑资料" aria-label="编辑资料">${ICONS.edit}</button>` +
          `<button class="icon-btn is-danger" type="button" data-act="delete" title="删除成员" aria-label="删除成员">${ICONS.trash}</button>` +
          `</div>` +
          `</li>`
        );
      })
      .join("");
  }

  /* ---------------- 渲染：记录 ---------------- */

  /**
   * 渲染最近的测量记录列表。
   */
  function renderRecords() {
    els.recordCount.textContent = `${state.records.length} 条`;
    if (!state.records.length) {
      els.recordList.innerHTML =
        '<li class="empty-line">暂无记录，完成一次称重后会自动生成一条待归属记录。</li>';
      return;
    }
    const shown = state.records.slice(0, 9);
    els.recordList.innerHTML = shown
      .map((record) => {
        const stamp = formatStamp(record.ts);
        const user = findUser(record.user_id);
        const pending = !record.user_id;
        const selected = record.id === state.selectedId;
        const fat = record.body && Number.isFinite(record.body.body_fat)
          ? `${formatNumber(record.body.body_fat, 1)}%`
          : "--";
        const tip = [
          record.impedance ? `阻抗 ${formatNumber(record.impedance, 1)} Ω` : "未测到阻抗",
          `${record.grams} g`,
        ].join(" · ");
        return (
          `<li class="record-row${selected ? " is-selected" : ""}${pending ? " is-pending" : ""}"` +
          ` data-record-id="${esc(record.id)}">` +
          `<div class="rec-time"><strong>${stamp.time}</strong><span>${stamp.day}</span></div>` +
          `<div class="rec-weight" title="${esc(tip)}"><span>${formatWeight(record.kg)}</span><i>kg</i></div>` +
          `<div class="rec-fat"><b>${fat}</b>体脂</div>` +
          `<div>${
            user
              ? `<span class="user-tag"${userColorStyle(user)}><span class="tag-dot"></span>${esc(user.name)}</span>`
              : '<span class="user-tag is-empty"><span class="tag-dot"></span>待分配</span>'
          }</div>` +
          `<div class="rec-actions">` +
          `<button class="icon-btn" type="button" data-act="assign" title="归属成员" aria-label="归属成员">${ICONS.assign}</button>` +
          `<button class="icon-btn is-danger" type="button" data-act="delete" title="删除记录" aria-label="删除记录">${ICONS.trash}</button>` +
          `</div>` +
          `</li>`
        );
      })
      .join("");
    els.recordCount.textContent =
      state.records.length > shown.length
        ? `${shown.length} / ${state.records.length} 条`
        : `${state.records.length} 条`;
  }

  /* ---------------- 渲染：体成分 ---------------- */

  /**
   * 渲染当前查看记录的身体成分。
   */
  function renderComposition() {
    const record = findRecord(state.selectedId) || state.records[0] || null;
    if (!record) {
      els.compGrid.hidden = true;
      els.compGrid.innerHTML = "";
      els.compEmpty.hidden = false;
      els.compEmpty.textContent = "暂无测量记录，完成一次称重后即可查看身体成分。";
      els.compContext.textContent = "暂无记录";
      els.compCount.textContent = "0";
      return;
    }

    const stamp = formatStamp(record.ts);
    const owner = findUser(record.user_id);
    els.compContext.textContent = `${stamp.day} ${stamp.time} · ${
      owner ? owner.name : "未分配"
    }`;

    const body = record.body;
    if (!body) {
      els.compGrid.hidden = true;
      els.compGrid.innerHTML = "";
      els.compEmpty.hidden = false;
      els.compCount.textContent = "0";
      if (!record.impedance) {
        els.compEmpty.textContent =
          "本次未测到阻抗（请光脚、双脚接触电极），只有体重记录，无法估算身体成分。";
      } else if (!record.user_id) {
        els.compEmpty.textContent =
          "这条记录还没有归属成员。选择成员后，将按其身高 / 年龄 / 性别重新估算体成分。";
      } else {
        els.compEmpty.textContent = "体成分计算失败，请检查成员资料后重试。";
      }
      return;
    }

    const grades = body.grades || {};
    els.compGrid.innerHTML = COMP_ITEMS.map((item) => {
      const value = body[item.key];
      if (!Number.isFinite(value)) return "";
      const grade = item.gradeKey ? grades[item.gradeKey] : null;
      const tag = grade
        ? `<span class="comp-grade ${gradeClass(grade)}">${esc(grade)}</span>`
        : "";
      const unit = item.unit ? `<i>${item.unit}</i>` : "";
      return (
        `<div class="comp-item${item.primary ? " is-primary" : ""}">` +
        `<span class="comp-label">${item.label}</span>` +
        `<span class="comp-value">${formatNumber(value, item.key === "bone" ? 2 : 1)}${unit}</span>` +
        tag +
        `</div>`
      );
    }).join("");
    els.compGrid.hidden = false;
    els.compEmpty.hidden = true;
    els.compCount.textContent = String(COMP_ITEMS.length);
  }

  /**
   * 重新渲染整页数据区域。
   */
  function renderAll() {
    renderUsers();
    renderRecords();
    renderComposition();
    renderHero();
  }

  /* ---------------- 弹窗 ---------------- */

  /**
   * 打开通用弹窗。
   * @param {{title:string, body:string, foot:string, mount?:Function}} options 弹窗配置
   */
  function openModal(options) {
    els.modalTitle.textContent = options.title;
    els.modalBody.innerHTML = options.body;
    els.modalFoot.innerHTML = options.foot;
    els.modalLayer.hidden = false;
    if (typeof options.mount === "function") options.mount();
  }

  /**
   * 关闭通用弹窗。
   */
  function closeModal() {
    els.modalLayer.hidden = true;
    els.modalBody.innerHTML = "";
    els.modalFoot.innerHTML = "";
  }

  /**
   * 绑定弹窗的关闭交互（关闭按钮、遮罩点击与 Esc）。
   */
  function setupModal() {
    els.modalClose.addEventListener("click", closeModal);
    els.modalLayer.addEventListener("click", (event) => {
      if (event.target === els.modalLayer) closeModal();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !els.modalLayer.hidden) closeModal();
    });
  }

  /**
   * 打开成员新增 / 编辑弹窗。
   * @param {object|null} user 待编辑成员；为空时表示新增
   */
  function openUserModal(user) {
    const editing = Boolean(user);
    const draft = {
      sex: user && user.sex === "female" ? "female" : "male",
    };
    const body =
      '<p class="modal-note">身高、年龄与性别用于触发阻抗测量并按 BIA 公式估算体成分。</p>' +
      '<div class="form-grid">' +
      '<label class="field field-wide"><span>成员姓名</span>' +
      `<input id="fName" type="text" maxlength="12" placeholder="如：我 / 小明" value="${esc(user ? user.name : "")}" /></label>` +
      `<label class="field"><span>身高 (cm)</span><input id="fHeight" type="number" min="100" max="230" step="1" value="${esc(user ? user.height_cm : 173)}" /></label>` +
      `<label class="field"><span>年龄 (岁)</span><input id="fAge" type="number" min="10" max="100" step="1" value="${esc(user ? user.age : 25)}" /></label>` +
      '<div class="field field-wide"><span>性别</span>' +
      '<div class="seg" id="fSex">' +
      '<button class="seg-btn" type="button" data-sex="male">男</button>' +
      '<button class="seg-btn" type="button" data-sex="female">女</button>' +
      "</div></div></div>";
    const foot =
      '<button class="btn btn-ghost" type="button" data-act="cancel">取消</button>' +
      '<button class="btn btn-primary" type="button" data-act="save">保存</button>';

    openModal({
      title: editing ? "编辑成员资料" : "新增成员",
      body,
      foot,
      mount() {
        const sexBox = $("fSex");
        const paintSex = () => {
          sexBox.querySelectorAll(".seg-btn").forEach((btn) => {
            btn.classList.toggle("is-on", btn.dataset.sex === draft.sex);
          });
        };
        sexBox.addEventListener("click", (event) => {
          const btn = event.target.closest(".seg-btn");
          if (!btn) return;
          draft.sex = btn.dataset.sex;
          paintSex();
        });
        paintSex();

        els.modalFoot.querySelector('[data-act="cancel"]').addEventListener("click", closeModal);
        els.modalFoot.querySelector('[data-act="save"]').addEventListener("click", () => {
          const name = $("fName").value.trim();
          const height = Number($("fHeight").value);
          const age = Number($("fAge").value);
          if (!name || name.length > 12) {
            showToast("请填写成员姓名（不超过 12 个字符）", "warn");
            return;
          }
          if (!Number.isFinite(height) || height < 100 || height > 230) {
            showToast("身高需在 100–230 cm 之间", "warn");
            return;
          }
          if (!Number.isFinite(age) || age < 10 || age > 100) {
            showToast("年龄需在 10–100 岁之间", "warn");
            return;
          }
          send({
            type: editing ? "update_user" : "add_user",
            id: user ? user.id : undefined,
            name,
            height_cm: Math.round(height),
            age: Math.round(age),
            sex: draft.sex,
          });
          closeModal();
          showToast(editing ? "成员资料已更新" : "成员已新增", "ok");
        });
        $("fName").focus();
      },
    });
  }

  /**
   * 打开记录归属弹窗。
   * @param {object} record 目标记录
   */
  function openAssignModal(record) {
    if (!state.users.length) {
      showToast("还没有成员，请先新增成员档案", "warn");
      openUserModal(null);
      return;
    }
    const stamp = formatStamp(record.ts);
    const options = state.users
      .map((user) => {
        const active = record.user_id === user.id;
        return (
          `<button class="choice${active ? " is-active" : ""}" type="button"` +
          ` data-user-id="${esc(user.id)}"${userColorStyle(user)}>` +
          `<span class="avatar">${esc(initial(user.name))}</span>` +
          `<span class="choice-info"><span class="choice-name">${esc(user.name)}</span>` +
          `<span class="choice-meta">${esc(user.height_cm)} cm · ${esc(user.age)} 岁 · ${
            user.sex === "female" ? "女" : "男"
          }</span></span>` +
          `<span class="micro-tag">${active ? "当前归属" : "选择"}</span>` +
          `</button>`
        );
      })
      .join("");
    const foot =
      '<button class="btn btn-ghost" type="button" data-act="cancel">取消</button>' +
      (record.user_id
        ? '<button class="btn" type="button" data-act="clear">取消归属</button>'
        : "");

    openModal({
      title: "归属成员",
      body:
        `<p class="modal-note">${stamp.day} ${stamp.time} · ${formatWeight(record.kg)} kg` +
        `　选择成员后，将按其资料重新估算体成分。</p>` +
        `<div class="choice-list">${options}</div>`,
      foot,
      mount() {
        els.modalBody.querySelector(".choice-list").addEventListener("click", (event) => {
          const btn = event.target.closest(".choice");
          if (!btn) return;
          send({ type: "assign_record", record_id: record.id, user_id: btn.dataset.userId });
          closeModal();
        });
        els.modalFoot.querySelector('[data-act="cancel"]').addEventListener("click", closeModal);
        const clear = els.modalFoot.querySelector('[data-act="clear"]');
        if (clear) {
          clear.addEventListener("click", () => {
            send({ type: "assign_record", record_id: record.id, user_id: null });
            closeModal();
          });
        }
      },
    });
  }

  /**
   * 打开确认弹窗。
   * @param {{title:string, message:string, confirmText:string, danger?:boolean, onConfirm:Function}} options 配置
   */
  function openConfirm(options) {
    openModal({
      title: options.title,
      body: `<p class="confirm-text">${options.message}</p>`,
      foot:
        '<button class="btn btn-ghost" type="button" data-act="cancel">取消</button>' +
        `<button class="btn ${options.danger ? "btn-danger" : "btn-primary"}" type="button" data-act="ok">${
          options.confirmText
        }</button>`,
      mount() {
        els.modalFoot.querySelector('[data-act="cancel"]').addEventListener("click", closeModal);
        els.modalFoot.querySelector('[data-act="ok"]').addEventListener("click", () => {
          closeModal();
          options.onConfirm();
        });
      },
    });
  }

  /* ---------------- 交互 ---------------- */

  /**
   * 把最新一条记录归属给指定成员。
   * @param {string} userId 成员 ID
   */
  function assignLatest(userId) {
    const latest = state.records.length ? state.records[0] : null;
    if (!latest) {
      showToast("暂无可归属的记录，请先称重", "warn");
      return;
    }
    const user = findUser(userId);
    send({ type: "assign_record", record_id: latest.id, user_id: userId });
    showToast(`已把 ${formatWeight(latest.kg)} kg 归属到 ${user ? user.name : "成员"}`, "ok");
  }

  /**
   * 绑定归属面板与成员列表的交互。
   */
  function setupInteractions() {
    els.assignChips.addEventListener("click", (event) => {
      const add = event.target.closest("[data-add-user]");
      if (add) {
        openUserModal(null);
        return;
      }
      const chip = event.target.closest(".user-chip");
      if (!chip) return;
      assignLatest(chip.dataset.userId);
    });

    els.userList.addEventListener("click", (event) => {
      const row = event.target.closest(".user-row");
      if (!row) return;
      const user = findUser(row.dataset.userId);
      if (!user) return;
      const act = event.target.closest("[data-act]");
      if (!act) return;
      if (act.dataset.act === "edit") {
        openUserModal(user);
      } else if (act.dataset.act === "delete") {
        openConfirm({
          title: "删除成员",
          message: `确定删除成员 <strong>${esc(user.name)}</strong>？名下仍有测量记录时无法删除。`,
          confirmText: "删除成员",
          danger: true,
          onConfirm() {
            send({ type: "delete_user", id: user.id });
          },
        });
      }
    });

    els.recordList.addEventListener("click", (event) => {
      const row = event.target.closest(".record-row");
      if (!row) return;
      const record = findRecord(row.dataset.recordId);
      if (!record) return;
      const act = event.target.closest("[data-act]");
      if (act) {
        if (act.dataset.act === "assign") {
          openAssignModal(record);
        } else if (act.dataset.act === "delete") {
          const stamp = formatStamp(record.ts);
          openConfirm({
            title: "删除记录",
            message: `确定删除 <strong>${stamp.day} ${stamp.time} · ${formatWeight(
              record.kg
            )} kg</strong> 这条记录？删除后不可恢复。`,
            confirmText: "删除记录",
            danger: true,
            onConfirm() {
              send({ type: "delete_record", record_id: record.id });
            },
          });
        }
        return;
      }
      state.selectedId = record.id;
      renderRecords();
      renderComposition();
    });

    els.addUserBtn.addEventListener("click", () => openUserModal(null));
  }

  /* ---------------- 初始化 ---------------- */

  /**
   * 绑定事件并启动数据流。
   */
  function init() {
    setupTheme();
    setupFullscreen();
    setupModal();
    setupInteractions();
    renderAll();
    connectWS();
  }

  init();
})();
