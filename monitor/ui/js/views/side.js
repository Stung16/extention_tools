// Cột bên trái: máy xử lý và dịch vụ, biểu đồ số job, con số chung.

import { $ } from "../dom.js";
import { esc } from "../format.js";
import { chartData, facts, healthRows } from "../model.js";
import { sinceFetch, state } from "../state.js";

export function renderHealth() {
  $("health").innerHTML = healthRows(state)
    .map(
      (r) => `
    <li>
      <span class="dot ${r.ok ? "dot--ok" : r.warn ? "" : "dot--bad"}"></span>
      <span class="health__name">${esc(r.name)}</span>
      <span class="health__ms">${r.ms}</span>
      <span class="health__sub${r.bad ? " health__sub--bad" : ""}">${r.sub}</span>
    </li>`,
    )
    .join("");
}

export function renderChart() {
  const c = chartData(state.samples);
  if (!c) {
    $("chart").innerHTML = `<p class="chart__empty">Biểu đồ hiện sau vài giây.</p>`;
    return;
  }
  const line = (cls, points) =>
    `<polyline class="${cls}" points="${points}" fill="none" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>`;
  $("chart").innerHTML = `
    <svg viewBox="0 0 ${c.width} ${c.height}" preserveAspectRatio="none" role="img"
         aria-label="Số job chờ và đang xử lý trong ${c.minutes} phút qua">
      <line class="chart__grid" x1="0" x2="${c.width}" y1="${c.top}" y2="${c.top}" stroke-dasharray="3 4"/>
      <line class="chart__grid" x1="0" x2="${c.width}" y1="${c.bottom}" y2="${c.bottom}"/>
      ${line("chart__wait", c.wait)}
      ${line("chart__run", c.run)}
    </svg>
    <div class="chart__legend">
      <span><i style="background:var(--wait)"></i>Chờ: ${c.last.wait}</span>
      <span><i style="background:var(--run)"></i>Đang xử lý: ${c.last.run}</span>
      <span>Cao nhất: ${c.peak}</span>
    </div>`;
}

export function renderFacts() {
  if (!state.ov) {
    $("facts").innerHTML = "";
    return;
  }
  $("facts").innerHTML =
    facts(state.ov, sinceFetch())
      .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`)
      .join("") +
    `<dt class="facts__note">Thời gian trung bình tính từ lúc gửi file tới lúc xong, gồm cả lúc chờ.</dt>`;
}
