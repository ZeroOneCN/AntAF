import { state } from "./state.js";
import { esc, colorVars, sexLabel, fmtWeight, fmtStamp, clampNum } from "./utils.js";
import { send } from "./ws.js";

export function openModal(title, bodyHtml, footHtml, layerEl, titleEl, bodyEl, footEl) {
  titleEl.textContent = title;
  bodyEl.innerHTML = bodyHtml;
  footEl.innerHTML = footHtml || "";
  layerEl.hidden = false;
}

export function closeModal(layerEl, bodyEl, footEl) {
  layerEl.hidden = true;
  bodyEl.innerHTML = "";
  footEl.innerHTML = "";
}

export function openUserModal(user, openModalFn, closeModalFn, modalLayer, modalTitle, modalBody, modalFoot, toastFn) {
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

export function openAssignModal(record, openModalFn, closeModalFn, modalLayer, modalTitle, modalBody, modalFoot, toastFn, onDiscard) {
  if (!record) return;
  if (!state.users.length) {
    toastFn("warn", "还没有成员档案，请先新增成员");
    return;
  }
  const discardBtn =
    !record.user_id && onDiscard
      ? '<button class="btn btn-ghost is-danger" type="button" data-act="discard">放弃这条记录</button>'
      : "";
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
    `${discardBtn}<button class="btn btn-ghost" type="button" data-act="cancel">关闭</button>`,
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
  const discard = modalFoot.querySelector('[data-act="discard"]');
  if (discard)
    discard.addEventListener("click", () => {
      closeModalFn(modalLayer, modalBody, modalFoot);
      onDiscard(record);
    });
  modalFoot.querySelector('[data-act="cancel"]').addEventListener("click", () => closeModalFn(modalLayer, modalBody, modalFoot));
}

export function openDiscardRecord(record, openModalFn, closeModalFn, modalLayer, modalTitle, modalBody, modalFoot) {
  if (!record) return;
  openModalFn(
    "放弃这次测量？",
    `<p class="modal-note"><b>${esc(fmtStamp(record.ts))}</b> · <b>${fmtWeight(record.kg)} kg</b>${
      record.user_name ? ` · ${esc(record.user_name)}` : ""
    }<br>放弃后这条记录会被删除，不计入趋势与成员统计，且不可恢复。</p>`,
    `<button class="btn btn-ghost" type="button" data-act="cancel">取消</button>
      <button class="btn btn-danger" type="button" data-act="ok">放弃</button>`,
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

export function openDeleteRecord(record, openModalFn, closeModalFn, modalLayer, modalTitle, modalBody, modalFoot) {
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

export function openDeleteUser(user, openModalFn, closeModalFn, modalLayer, modalTitle, modalBody, modalFoot) {
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
