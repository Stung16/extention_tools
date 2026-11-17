// Khung bảng có tab: Hàng chờ, Lịch sử 24 giờ, Theo công cụ. Kèm nút lọc và số trên tab.
// Dòng job mang data-job (mở chi tiết), dòng công cụ mang data-type (lọc theo công cụ đó); main.js xử lý khi bấm.

import { $, setHtmlKeepScroll } from "../dom.js";
import { ago, dur, esc, statusBadge, workerName } from "../format.js";
import { historyRows, queueRows, toolRows } from "../model.js";
import { sinceFetch, state } from "../state.js";

const FILTERS = {
  queue: [],
  history: [
    ["all", "Tất cả"],
    ["done", "Xong"],
    ["fail", "Lỗi"],
    ["cancel", "Đã huỷ"],
  ],
  tools: [
    ["active", "Có job"],
    ["all", "Tất cả công cụ"],
  ],
};

export function renderTabs() {
  document
    .querySelectorAll("#tabs [role=tab]")
    .forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === state.tab)));
}

export function renderFilters() {
  const opts = FILTERS[state.tab];
  const cur = state.filter[state.tab];
  $("filters").innerHTML = opts
    .map(([v, label]) => `<button type="button" data-filter="${v}" aria-pressed="${v === cur}">${label}</button>`)
    .join("");
  $("filters").hidden = !opts.length;
}

const emptyState = (title, text) => `<div class="empty"><strong>${title}</strong>${text}</div>`;
const selectedAttr = (id) => (id === state.selected ? ' class="is-selected"' : "");

export function renderTable() {
  const ov = state.ov;
  $("tab-n-queue").textContent = ov?.totals.pending ?? 0;
  $("tab-n-history").textContent = ov?.recent.length ?? 0;
  if (!ov) {
    $("table").innerHTML = emptyState("Chưa có số liệu", "Đang chờ API trả lời.");
    return;
  }
  const html = { queue: queueTable, history: historyTable, tools: toolsTable }[state.tab](ov, sinceFetch());
  setHtmlKeepScroll($("table"), html);
}

function queueTable(ov, since) {
  const rows = queueRows(ov, state.search);
  if (!rows.length) {
    return state.search
      ? emptyState("Không tìm thấy", "Không có job chờ nào khớp với từ khoá.")
      : emptyState("Hàng chờ trống", "Job mới gửi lên sẽ hiện ở đây.");
  }
  const note = (j) => {
    if (!j.workerOnline) return `<span class="cell-alert">Máy xử lý đang tắt</span>`;
    if (j.attempts > 0) return `<span class="cell-warn">Bị dừng giữa chừng ${j.attempts} lần, chờ làm lại</span>`;
    return "";
  };
  const partial =
    ov.totals.pending > ov.waiting.length
      ? `<p class="empty empty--note">Chỉ hiện ${ov.waiting.length} job chờ lâu nhất trong ${ov.totals.pending} job.</p>`
      : "";
  return `
    <table><thead><tr><th>Công cụ</th><th>File</th><th>Nguồn</th><th>Máy</th><th class="num">Đã chờ</th><th>Ghi chú</th></tr></thead><tbody>
    ${rows
      .map(
        (j) => `<tr data-job="${esc(j.id)}"${selectedAttr(j.id)}>
      <td>${esc(j.label)}</td><td class="cell-file" title="${esc(j.name)}">${esc(j.name)}</td>
      <td class="cell-muted">${esc(j.source)}</td>
      <td>${workerName(j.worker)}</td><td class="num">${dur(j.waitSeconds + since)}</td>
      <td>${note(j)}</td>
    </tr>`,
      )
      .join("")}</tbody></table>${partial}`;
}

function historyTable(ov, since) {
  const f = state.filter.history;
  const rows = historyRows(ov, f, state.search);
  if (!rows.length) {
    if (f === "fail") return emptyState("Không có job lỗi", "Không có job nào lỗi trong 24 giờ qua.");
    if (f === "cancel") return emptyState("Không có job bị huỷ", "Không có job nào bị huỷ trong 24 giờ qua.");
    return emptyState("Chưa có job nào", "Job xong, lỗi hoặc bị huỷ trong 24 giờ qua sẽ hiện ở đây.");
  }
  return `
    <table><thead><tr><th>Lúc</th><th>Công cụ</th><th>File</th><th>Nguồn</th><th>Kết quả</th><th class="num">Thời gian</th><th>Lỗi</th></tr></thead><tbody>
    ${rows
      .map(
        (j) => `<tr data-job="${esc(j.id)}"${selectedAttr(j.id)}>
      <td class="cell-muted">${ago(j.agoSeconds + since)}</td><td>${esc(j.label)}</td>
      <td class="cell-file" title="${esc(j.name)}">${esc(j.name)}</td>
      <td class="cell-muted">${esc(j.source)}</td>
      <td>${statusBadge(j.status)}</td>
      <td class="num">${dur(j.seconds)}${j.attempts > 1 ? `<br><span class="cell-muted">${j.attempts} lượt</span>` : ""}</td>
      <td class="cell-error" title="${esc(j.error)}">${esc(j.error)}</td>
    </tr>`,
      )
      .join("")}</tbody></table>`;
}

function toolsTable(ov) {
  const rows = toolRows(ov, state.filter.tools, state.search);
  if (!rows.length) {
    return emptyState("Chưa có công cụ nào được dùng", "Chọn “Tất cả công cụ” để xem cả những công cụ chưa có job.");
  }
  const num = (n) => n || "-";
  return `
    <table><thead><tr><th>Công cụ</th><th>Máy</th><th class="num">Chờ</th><th class="num">Đang chạy</th><th class="num">Xong 24h</th><th class="num">Lỗi 24h</th><th class="num">Trung bình</th></tr></thead><tbody>
    ${rows
      .map(
        (t) => `<tr data-type="${esc(t.type)}">
      <td><span class="tool-cell"><span class="dot ${t.online ? "dot--ok" : "dot--bad"}" title="${t.online ? "Máy xử lý đang bật" : "Máy xử lý đang tắt"}"></span>${esc(t.label)}</span></td>
      <td>${workerName(t.worker)}</td><td class="num">${num(t.pending)}</td><td class="num">${num(t.processing)}</td>
      <td class="num">${num(t.done24h)}</td><td class="num${t.failed24h ? " cell-alert" : ""}">${num(t.failed24h)}</td>
      <td class="num">${t.avgSeconds24h == null ? "-" : dur(t.avgSeconds24h)}</td>
    </tr>`,
      )
      .join("")}</tbody></table>`;
}
