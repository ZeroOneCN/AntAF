import { state } from "./state.js";
import { renderAll } from "./render.js";
import { connect, handleMessage, send, toast } from "./ws.js";
import {
  openModal,
  closeModal,
  openUserModal,
  openAssignModal,
  openDeleteRecord,
  openDeleteUser,
} from "./modal.js";
import { initThreeEffects } from "./three-effects.js";

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
};

function tickClock() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  el.clockTime.textContent = `${h}:${m}`;
  el.clockDate.textContent = `${now.getMonth() + 1}月${now.getDate()}日 周${"日一二三四五六"[now.getDay()]}`;
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
  setInterval(tickClock, 10_000);
  renderAll(el, actions);
});

window.__antaf = { push: onMessage, state, send };
