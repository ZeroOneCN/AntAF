import { state } from "./state.js";
import { renderAll } from "./render.js";
import { connect, handleMessage, send, toast } from "./ws.js";
import { openModal, closeModal, openUserModal, openAssignModal, openDeleteRecord, openDeleteUser } from "./modal.js";

console.log("[main.js] Module loaded");

const $ = (id) => document.getElementById(id);

// 延迟获取元素，确保 DOM 已加载
let el;

function initElements() {
  el = {
    clockTime: $("clockTime"), clockDate: $("clockDate"),
    wsPill: $("wsPill"), wsText: $("wsText"), scalePill: $("scalePill"), scaleText: $("scaleText"),
    weightValue: $("weightValue"), weightTime: $("weightTime"),
    memberList: $("memberList"), recordList: $("recordList"),
    metricsDrawer: $("metricsDrawer"), drawerToggle: $("drawerToggle"),
    modalLayer: $("modalLayer"), modalTitle: $("modalTitle"), modalBody: $("modalBody"),
    modalFoot: $("modalFoot"), modalClose: $("modalClose"), toasts: $("toasts"),
  };
  
  console.log("[initElements] All elements initialized:", {
    clockTime: !!el.clockTime,
    clockDate: !!el.clockDate,
    weightValue: !!el.weightValue,
  });
}

/* ---------------- 页面杂项 ---------------- */

function tickClock() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  
  console.log("[tickClock] clockTime:", el.clockTime, "clockDate:", el.clockDate);
  
  if (el.clockTime) {
    el.clockTime.textContent = `${h}:${m}`;
    console.log("[tickClock] Set clockTime to:", `${h}:${m}`);
  } else {
    console.error("[tickClock] el.clockTime is null!");
  }
  
  if (el.clockDate) {
    el.clockDate.textContent = `${now.getMonth() + 1}月${now.getDate()}日 周${
      "日一二三四五六"[now.getDay()]
    }`;
    console.log("[tickClock] Set clockDate to:", el.clockDate.textContent);
  } else {
    console.error("[tickClock] el.clockDate is null!");
  }
}

/* ---------------- WebSocket ---------------- */

function onMessage(data) {
  handleMessage(data, toastFn);
  renderAll(el);
}

connect(onMessage, toastFn);

/* ---------------- 启动 ---------------- */

document.addEventListener("DOMContentLoaded", () => {
  initElements();
  
  // 模态框包装器函数
  function openUserModalFn(user) {
    openUserModal(user, openModal, closeModal, el.modalLayer, el.modalTitle, el.modalBody, el.modalFoot, toastFn);
  }

  function openAssignModalFn(record) {
    openAssignModal(record, openModal, closeModal, el.modalLayer, el.modalTitle, el.modalBody, el.modalFoot, toastFn);
  }

  function openDeleteRecordFn(record) {
    openDeleteRecord(record, openModal, closeModal, el.modalLayer, el.modalTitle, el.modalBody, el.modalFoot);
  }

  function openDeleteUserFn(user) {
    openDeleteUser(user, openModal, closeModal, el.modalLayer, el.modalTitle, el.modalBody, el.modalFoot);
  }

  function toastFn(level, text) {
    toast(level, text, el.toasts);
  }
  
  // Drawer toggle
  if (el.drawerToggle && el.metricsDrawer) {
    el.drawerToggle.addEventListener("click", () => {
      el.metricsDrawer.classList.toggle("open");
    });

    // Close drawer when clicking outside
    document.addEventListener("click", (e) => {
      if (!el.metricsDrawer.contains(e.target) && !el.drawerToggle.contains(e.target)) {
        el.metricsDrawer.classList.remove("open");
      }
    });
  }

  // Escape key handler
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!el.modalLayer.hidden) closeModal(el.modalLayer, el.modalBody, el.modalFoot);
      if (el.metricsDrawer) el.metricsDrawer.classList.remove("open");
    }
  });

  // Visibility change handler
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      tickClock();
      renderAll(el);
    }
  });

  // Modal close handlers
  el.modalClose.addEventListener("click", () => closeModal(el.modalLayer, el.modalBody, el.modalFoot));
  el.modalLayer.addEventListener("click", (e) => {
    if (e.target === el.modalLayer) closeModal(el.modalLayer, el.modalBody, el.modalFoot);
  });

  tickClock();
  setInterval(tickClock, 10_000);
  renderAll(el);
});

/* 调试入口 */
window.__antaf = { push: onMessage, state, send };
