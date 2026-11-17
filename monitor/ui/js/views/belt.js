// "Băng chuyền" giữa màn hình: Hàng chờ -> Đang xử lý -> Kết quả 24 giờ. Mỗi trạm hiện vài job đầu tiên.
// Mỗi job mang data-job="<id>": bấm vào thì main.js mở ngăn chi tiết.

import { $ } from "../dom.js";
import { ago, clock, esc, shortDur, statusBadge, workerName } from "../format.js";
import { leaseInfo } from "../model.js";
import { sinceFetch, state } from "../state.js";

const SHOWN_WAITING = 3;
const SHOWN_RUNNING = 2;
const SHOWN_RECENT = 3;

export function renderBelt() {
  const ov = state.ov;
  const since = sinceFetch();
  $("belt").classList.toggle("belt--running", (ov?.running.length ?? 0) > 0);
  renderWaiting(ov, since);
  renderRunning(ov, since);
  renderRecent(ov, since);
}

function renderWaiting(ov, since) {
  const waiting = ov?.waiting ?? [];
  $("count-wait").textContent = ov?.totals.pending ?? 0;
  const online = (w) => ov.workers.some((x) => x.name === w && x.online);
  const shown = waiting.slice(0, SHOWN_WAITING);
  if (!shown.length) {
    $("body-wait").innerHTML = `<li class="station__empty">Không có job nào đang chờ.</li>`;
    return;
  }
  const more = ov.totals.pending - shown.length;
  $("body-wait").innerHTML =
    shown
      .map(
        (j) => `
      <li class="ticket${online(j.worker) ? "" : " ticket--alert"}" data-job="${esc(j.id)}">
        <span class="ticket__tool">${esc(j.label)}</span>
        <span class="ticket__file" title="${esc(j.name)}">${esc(j.name)}</span>
        <span class="ticket__side">${online(j.worker) ? shortDur(j.waitSeconds + since) : "máy tắt"}</span>
      </li>`,
      )
      .join("") + (more > 0 ? `<li class="station__more">và ${more} job khác</li>` : "");
}

function renderRunning(ov, since) {
  const running = ov?.running ?? [];
  $("count-run").textContent = running.length;
  if (!running.length) {
    $("body-run").innerHTML = `<li class="station__empty">${ov ? "Máy đang rảnh." : "Chưa có số liệu."}</li>`;
    return;
  }
  const more = running.length - SHOWN_RUNNING;
  $("body-run").innerHTML =
    running
      .slice(0, SHOWN_RUNNING)
      .map((j) => {
        const { left, late, pct } = leaseInfo(j, since);
        const leaseText = late ? "quá hạn giữ chỗ" : left == null ? "" : `giữ chỗ còn ${clock(left)}`;
        return `
      <li class="runcard${late ? " runcard--late" : ""}" data-job="${esc(j.id)}">
        <span class="runcard__tool">${esc(j.label)}</span>
        <span class="runcard__file" title="${esc(j.name)}">${esc(j.name)}</span>
        <span class="runcard__timer">${clock(j.seconds + since)}</span>
        <span class="runcard__meta">
          <span>${workerName(j.worker)}${j.attempt > 1 ? `, làm lại lần ${j.attempt}` : ""}</span>
          <span>${leaseText}</span>
        </span>
        <span class="runcard__lease"><span style="width:${pct}%"></span></span>
      </li>`;
      })
      .join("") + (more > 0 ? `<li class="station__more">và ${more} job khác đang chạy</li>` : "");
}

function renderRecent(ov, since) {
  const recent = ov?.recent ?? [];
  const done = ov?.last24h.done ?? 0;
  const failed = ov?.last24h.failed ?? 0;
  $("count-done").textContent = done;
  $("count-fail").textContent = failed;
  $("count-done").classList.toggle("station__count--zero", done === 0);
  $("count-fail").classList.toggle("station__count--zero", failed === 0);
  const shown = recent.slice(0, SHOWN_RECENT);
  $("body-done").innerHTML = shown.length
    ? shown
        .map(
          (j) => `
      <li class="ticket" data-job="${esc(j.id)}">
        <span class="ticket__tool">${esc(j.label)}</span>
        <span class="ticket__file" title="${esc(j.name)}">${esc(j.name)}</span>
        <span class="ticket__side">${statusBadge(j.status)}<br>${ago(j.agoSeconds + since)}</span>
      </li>`,
        )
        .join("")
    : `<li class="station__empty">Chưa có job nào kết thúc trong 24 giờ.</li>`;
}
