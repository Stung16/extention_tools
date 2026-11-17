// Ngăn chi tiết job (trượt ra bên phải khi bấm một job).
// Nút mang data-act="close" | "copy" | "ask-cancel" | "keep" | "retry" | "cancel"; main.js xử lý khi bấm.

import { $ } from "../dom.js";
import { esc } from "../format.js";
import { findJob, JOB_NOTES, jobAction, jobDetails } from "../model.js";
import { sinceFetch, state } from "../state.js";

const KIND_BADGE = {
  wait: `<span class="badge badge--wait">Đang chờ</span>`,
  run: `<span class="badge badge--run">Đang xử lý</span>`,
  done: `<span class="badge badge--done">Xong</span>`,
  fail: `<span class="badge badge--fail">Lỗi</span>`,
  cancel: `<span class="badge badge--muted">Đã huỷ</span>`,
};

export function renderDrawer() {
  const drawer = $("drawer");
  const open = Boolean(state.selected);
  drawer.classList.toggle("is-open", open);
  drawer.setAttribute("aria-hidden", String(!open));
  if (!open) return;

  const j = findJob(state.ov, state.selected);
  if (!j) {
    $("drawer-inner").innerHTML = `${head("Không còn thấy job này", "")}
      <p class="drawer__note">Job có thể đã kết thúc hơn 24 giờ hoặc nằm ngoài danh sách đang hiện.</p>`;
    return;
  }
  const rows = [["Trạng thái", KIND_BADGE[j.kind]], ...jobDetails(j, sinceFetch())];
  const note = JOB_NOTES[j.kind];
  const buttons = actionButtons(jobAction(j.kind));
  $("drawer-inner").innerHTML = `
    ${head(esc(j.label), esc(j.name))}
    <dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
    ${j.error ? `<div class="drawer__error">${esc(j.error)}</div>` : ""}
    ${buttons ? `<div class="drawer__actions">${buttons}</div>` : ""}
    ${note ? `<p class="drawer__note">${note}</p>` : ""}
    <div class="idline"><code>${esc(j.id)}</code><button class="btn btn--small" type="button" data-act="copy">Chép mã job</button></div>`;
}

// Huỷ cần bấm hai lần (tránh bấm nhầm); thử lại thì một lần.
function actionButtons(action) {
  if (action === "retry")
    return `<button class="btn btn--primary" type="button" data-act="retry">Thử lại job này</button>`;
  if (action !== "cancel") return "";
  return state.confirming
    ? `<button class="btn btn--danger" type="button" data-act="cancel">Bấm lần nữa để huỷ</button><button class="btn" type="button" data-act="keep">Không huỷ</button>`
    : `<button class="btn" type="button" data-act="ask-cancel">Huỷ job này</button>`;
}

function head(title, file) {
  return `<div class="drawer__head"><div><h2 class="drawer__title">${title}</h2>${file ? `<p class="drawer__file">${file}</p>` : ""}</div>
    <button class="drawer__close" type="button" data-act="close" aria-label="Đóng"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>`;
}
