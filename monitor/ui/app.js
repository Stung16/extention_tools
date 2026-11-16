// Giao diện trình giám sát. Lấy số liệu qua các lệnh Rust (src/main.rs) rồi vẽ lại trang.
"use strict";

const invoke = window.__TAURI__?.core?.invoke;
const $ = (id) => document.getElementById(id);

// ---------- Cài đặt (lưu trong máy, lỡ không lưu được vẫn chạy với mặc định) ----------

const DEFAULTS = { apiUrl: "http://localhost:5100", key: "dev-admin-key" };
function loadSettings() {
  try {
    const saved = { ...DEFAULTS, ...JSON.parse(localStorage.getItem("monitor.settings") || "{}") };
    // Bản cũ dùng mã worker cho cửa quản trị; giờ cửa quản trị có mã riêng.
    if (saved.key === "dev-worker-key") saved.key = DEFAULTS.key;
    return saved;
  } catch {
    return { ...DEFAULTS };
  }
}
function saveSettings(s) {
  try { localStorage.setItem("monitor.settings", JSON.stringify(s)); } catch { /* không lưu được thì thôi */ }
}

const state = {
  settings: loadSettings(),
  ov: null,            // số liệu lần hỏi API gần nhất
  err: null,           // lỗi khi hỏi API
  fetchedAt: 0,        // performance.now() lúc nhận số liệu, để đồng hồ job đang chạy chạy tiếp mỗi giây
  updatedAt: 0,
  services: [],
  samples: [],         // [{t, wait, run}] cho biểu đồ, tối đa 30 phút
  tab: "queue",
  filter: { history: "all", tools: "active" },
  search: "",
  selected: null,      // id job đang mở ở ngăn chi tiết
  confirming: false,   // đang chờ bấm lần hai để huỷ job
};

// Dịch vụ cần kiểm tra: cùng máy với API. "required" = tắt thì một nhóm công cụ sẽ lỗi.
function serviceTargets() {
  let host = "localhost";
  try { host = new URL(state.settings.apiUrl).hostname; } catch { /* địa chỉ sai: dùng localhost */ }
  return [
    { name: "Stirling-PDF", url: `http://${host}:8080/`, required: true, affects: "các công cụ PDF" },
    { name: "Gotenberg", url: `http://${host}:3000/health`, required: true, affects: "chuyển Word, Excel, PowerPoint sang PDF" },
    { name: "Ollama", url: `http://${host}:11434/`, required: false, affects: "chỉ cần trên máy GPU" },
  ];
}

// ---------- Định dạng ----------

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const WORKER_NAMES = { main: "Máy chính", ai: "Máy AI", photo: "Máy ảnh RAW" };
const workerName = (w) => WORKER_NAMES[w] || w;
const STATUS_BADGE = {
  Done: `<span class="badge badge--done">Xong</span>`,
  Failed: `<span class="badge badge--fail">Lỗi</span>`,
  Cancelled: `<span class="badge badge--muted">Đã huỷ</span>`,
};
const statusBadge = (s) => STATUS_BADGE[s] || esc(s);

function dur(s) {
  s = Math.max(0, Math.round(s));
  if (s < 60) return `${s} giây`;
  if (s < 3600) return `${Math.floor(s / 60)} phút${s % 60 ? ` ${s % 60} giây` : ""}`;
  const m = Math.floor((s % 3600) / 60);
  return `${Math.floor(s / 3600)} giờ${m ? ` ${m} phút` : ""}`;
}
function shortDur(s) {
  s = Math.max(0, Math.round(s));
  if (s < 60) return `${s} giây`;
  if (s < 3600) return `${Math.floor(s / 60)} phút`;
  return `${Math.floor(s / 3600)} giờ ${Math.floor((s % 3600) / 60)} phút`;
}
function ago(s) {
  if (s < 5) return "vừa xong";
  return `${shortDur(s)} trước`;
}
function clock(s) {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0"), ss = String(sec).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
function bytes(b) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (b >= 1024 && i < units.length - 1) { b /= 1024; i++; }
  return `${b.toFixed(i ? 1 : 0).replace(".", ",")} ${units[i]}`;
}
const sinceFetch = () => (performance.now() - state.fetchedAt) / 1000;

// ---------- Hỏi API ----------

async function pollOverview() {
  if (!invoke) {
    state.err = "Trang này cần chạy trong app trình giám sát (cargo run trong thư mục monitor).";
  } else {
    try {
      const ov = await invoke("overview", { apiUrl: state.settings.apiUrl, key: state.settings.key });
      state.ov = ov;
      state.err = null;
      state.fetchedAt = performance.now();
      const now = Date.now();
      state.samples.push({ t: now, wait: ov.totals.pending, run: ov.totals.processing });
      while (state.samples.length && now - state.samples[0].t > 30 * 60 * 1000) state.samples.shift();
    } catch (e) {
      state.err = String(e);
    }
  }
  state.updatedAt = Date.now();
  render();
  setTimeout(pollOverview, 2000);
}

async function pollServices() {
  if (invoke) {
    const targets = serviceTargets();
    try {
      const results = await invoke("check_services", { targets: targets.map(({ name, url }) => ({ name, url })) });
      state.services = results.map((r, i) => ({ ...targets[i], ...r }));
    } catch (e) {
      state.services = [];
    }
    renderHealth();
    renderAttention();
  }
  setTimeout(pollServices, 5000);
}

async function jobAction(id, action) {
  try {
    await invoke("job_action", { apiUrl: state.settings.apiUrl, key: state.settings.key, id, action });
    toast(action === "retry" ? "Đã đưa job vào lại hàng chờ." : "Đã huỷ job.");
    state.confirming = false;
  } catch (e) {
    toast(String(e), true);
    renderDrawer();
  }
}

// ---------- Vẽ ----------

function render() {
  renderConn();
  renderAttention();
  renderBelt();
  renderHealth();
  renderChart();
  renderFacts();
  renderTable();
  renderDrawer();
}

function renderConn() {
  const dot = $("conn").querySelector(".dot");
  if (state.err) {
    dot.className = "dot dot--bad";
    $("conn-text").textContent = state.ov ? "Mất kết nối API, đang hiện số liệu cũ" : "Chưa kết nối được API";
  } else if (state.ov) {
    dot.className = "dot dot--ok";
    const s = Math.round((Date.now() - state.updatedAt) / 1000);
    $("conn-text").textContent = s < 3 ? `Đã kết nối ${hostOf(state.settings.apiUrl)}` : `Cập nhật ${s} giây trước`;
  }
}
function hostOf(url) {
  try { return new URL(url).host; } catch { return url; }
}

function attentionItems() {
  const items = [];
  if (state.err) items.push({ level: "error", html: esc(state.err), action: { label: "Mở cài đặt", run: "settings" } });
  const ov = state.ov;
  if (ov) {
    for (const w of ov.workers) {
      if (!w.online && w.pending > 0) {
        items.push({ level: "error", html: `<strong>${w.pending} job</strong> đang chờ ${workerName(w.name)}, nhưng máy này đang tắt. Bật worker ${esc(w.name)} để xử lý tiếp.` });
      }
    }
    const late = ov.running.filter((j) => j.leaseSecondsLeft != null && j.leaseSecondsLeft - sinceFetch() < 0);
    if (late.length) items.push({ level: "warn", html: `${late.length} job đang chạy đã quá hạn giữ chỗ: máy xử lý có thể đã dừng, job sẽ được giao lại.` });
    const anyOnline = ov.workers.some((w) => w.online);
    if (ov.oldestPendingSeconds > 300 && anyOnline) {
      items.push({ level: "warn", html: `Có job đã chờ ${shortDur(ov.oldestPendingSeconds)}. Máy xử lý có thể đang quá tải.` });
    }
  }
  for (const s of state.services) {
    if (s.required && !s.up) items.push({ level: "warn", html: `<strong>${esc(s.name)}</strong> không chạy: ${esc(s.affects)} sẽ lỗi.` });
  }
  if (ov && ov.last24h.failed > 0) {
    items.push({ level: "info", html: `${ov.last24h.failed} job lỗi trong 24 giờ qua.`, action: { label: "Xem job lỗi", run: "failed" } });
  }
  return items;
}

function renderAttention() {
  const items = attentionItems();
  const box = $("attention");
  if (!items.length) {
    box.innerHTML = state.ov ? `<p class="notice notice--calm"><span class="dot dot--ok"></span>Mọi thứ đang chạy bình thường.</p>` : "";
    return;
  }
  box.innerHTML = items.map((it, i) => `
    <div class="notice notice--${it.level}">
      <span class="notice__text">${it.html}</span>
      ${it.action ? `<button class="btn btn--small" type="button" data-attn="${i}">${esc(it.action.label)}</button>` : ""}
    </div>`).join("");
  box.querySelectorAll("[data-attn]").forEach((b) => {
    const action = items[Number(b.dataset.attn)].action.run;
    b.addEventListener("click", () => {
      if (action === "settings") openSettings();
      if (action === "failed") { state.filter.history = "fail"; setTab("history"); }
    });
  });
}

function renderBelt() {
  const ov = state.ov;
  const waiting = ov?.waiting ?? [], running = ov?.running ?? [], recent = ov?.recent ?? [];
  $("belt").classList.toggle("belt--running", running.length > 0);

  $("count-wait").textContent = ov?.totals.pending ?? 0;
  const online = (w) => ov?.workers.some((x) => x.name === w && x.online);
  const shownWait = waiting.slice(0, 3);
  $("body-wait").innerHTML = shownWait.length
    ? shownWait.map((j) => `
      <li class="ticket${online(j.worker) ? "" : " ticket--alert"}" data-job="${esc(j.id)}">
        <span class="ticket__tool">${esc(j.label)}</span>
        <span class="ticket__file" title="${esc(j.name)}">${esc(j.name)}</span>
        <span class="ticket__side">${online(j.worker) ? shortDur(j.waitSeconds + sinceFetch()) : "máy tắt"}</span>
      </li>`).join("") + (ov.totals.pending > shownWait.length ? `<li class="station__more">và ${ov.totals.pending - shownWait.length} job khác</li>` : "")
    : `<li class="station__empty">Không có job nào đang chờ.</li>`;

  $("count-run").textContent = running.length;
  $("body-run").innerHTML = running.length
    ? running.slice(0, 2).map((j) => {
      const left = j.leaseSecondsLeft == null ? null : j.leaseSecondsLeft - sinceFetch();
      const late = left != null && left < 0;
      const pct = left == null ? 0 : Math.max(0, Math.min(100, (left / 120) * 100));
      return `
      <li class="runcard${late ? " runcard--late" : ""}" data-job="${esc(j.id)}">
        <span class="runcard__tool">${esc(j.label)}</span>
        <span class="runcard__file" title="${esc(j.name)}">${esc(j.name)}</span>
        <span class="runcard__timer">${clock(j.seconds + sinceFetch())}</span>
        <span class="runcard__meta">
          <span>${workerName(j.worker)}${j.attempt > 1 ? `, làm lại lần ${j.attempt}` : ""}</span>
          <span>${late ? "quá hạn giữ chỗ" : left == null ? "" : `giữ chỗ còn ${clock(left)}`}</span>
        </span>
        <span class="runcard__lease"><span style="width:${pct}%"></span></span>
      </li>`;
    }).join("") + (running.length > 2 ? `<li class="station__more">và ${running.length - 2} job khác đang chạy</li>` : "")
    : `<li class="station__empty">${ov ? "Máy đang rảnh." : "Chưa có số liệu."}</li>`;

  const done = ov?.last24h.done ?? 0, failed = ov?.last24h.failed ?? 0;
  $("count-done").textContent = done;
  $("count-fail").textContent = failed;
  $("count-done").classList.toggle("station__count--zero", done === 0);
  $("count-fail").classList.toggle("station__count--zero", failed === 0);
  const shownDone = recent.slice(0, 3);
  $("body-done").innerHTML = shownDone.length
    ? shownDone.map((j) => `
      <li class="ticket" data-job="${esc(j.id)}">
        <span class="ticket__tool">${esc(j.label)}</span>
        <span class="ticket__file" title="${esc(j.name)}">${esc(j.name)}</span>
        <span class="ticket__side">${statusBadge(j.status)}<br>${ago(j.agoSeconds + sinceFetch())}</span>
      </li>`).join("")
    : `<li class="station__empty">Chưa có job nào kết thúc trong 24 giờ.</li>`;
}

function renderHealth() {
  const ov = state.ov;
  const rows = [];
  rows.push(state.err
    ? { ok: false, name: "API", sub: "Không kết nối được", ms: "" }
    : { ok: !!ov, name: "API", sub: ov ? `Đang chạy ở ${esc(hostOf(state.settings.apiUrl))}` : "Đang kết nối…", ms: "" });
  for (const w of ov?.workers ?? []) {
    let sub;
    if (w.online) sub = `Đang bật. ${w.processing ? `Đang làm ${w.processing} job` : "Đang rảnh"}${w.pending ? `, ${w.pending} job chờ` : ""}.`;
    else if (w.lastSeenSecondsAgo != null) sub = `Đang tắt, lần cuối thấy ${ago(w.lastSeenSecondsAgo)}.`;
    else sub = "Đang tắt.";
    rows.push({ ok: w.online, warn: !w.online && w.pending === 0, name: `${workerName(w.name)} (worker ${w.name})`, sub, ms: "" });
  }
  for (const s of state.services) {
    rows.push({
      ok: s.up, warn: !s.up && !s.required, name: s.name,
      sub: s.up ? (s.required ? "Đang chạy" : `Đang chạy (${s.affects})`) : `${s.detail}${s.required ? "" : `, ${s.affects}`}`,
      bad: !s.up && s.required, ms: s.up ? `${s.millis} ms` : "",
    });
  }
  $("health").innerHTML = rows.map((r) => `
    <li>
      <span class="dot ${r.ok ? "dot--ok" : r.warn ? "" : "dot--bad"}"></span>
      <span class="health__name">${esc(r.name)}</span>
      <span class="health__ms">${r.ms}</span>
      <span class="health__sub${r.bad ? " health__sub--bad" : ""}">${r.sub}</span>
    </li>`).join("");
}

function renderChart() {
  const pts = state.samples;
  if (pts.length < 2) {
    $("chart").innerHTML = `<p class="chart__empty">Biểu đồ hiện sau vài giây.</p>`;
    return;
  }
  const W = 300, H = 92, pad = 4;
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t || t0 + 1;
  const peak = Math.max(...pts.map((p) => Math.max(p.wait, p.run)));
  const max = Math.max(3, peak);
  const x = (t) => pad + ((t - t0) / Math.max(1, t1 - t0)) * (W - pad * 2);
  const y = (v) => H - pad - (v / max) * (H - pad * 2);
  const line = (key) => pts.map((p) => `${x(p.t).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  const minutes = Math.max(1, Math.round((t1 - t0) / 60000));
  $("chart").innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Số job chờ và đang xử lý trong ${minutes} phút qua">
      <line class="chart__grid" x1="0" x2="${W}" y1="${y(max)}" y2="${y(max)}" stroke-dasharray="3 4"/>
      <line class="chart__grid" x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}"/>
      <polyline class="chart__wait" points="${line("wait")}" fill="none" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
      <polyline class="chart__run" points="${line("run")}" fill="none" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
    </svg>
    <div class="chart__legend">
      <span><i style="background:var(--wait)"></i>Chờ: ${last.wait}</span>
      <span><i style="background:var(--run)"></i>Đang xử lý: ${last.run}</span>
      <span>Cao nhất: ${peak}</span>
    </div>`;
}

function renderFacts() {
  const ov = state.ov;
  if (!ov) { $("facts").innerHTML = ""; return; }
  const facts = [
    ["Chờ lâu nhất", ov.oldestPendingSeconds == null ? "Không có" : dur(ov.oldestPendingSeconds + sinceFetch())],
    ["Thời gian trung bình", ov.last24h.avgSeconds == null ? "Chưa có" : dur(ov.last24h.avgSeconds)],
    ["File đang lưu", `${ov.storage.files} file, ${bytes(ov.storage.bytes)}`],
    ["Từ trước tới nay", `${ov.totals.done} xong, ${ov.totals.failed} lỗi`],
  ];
  $("facts").innerHTML = facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("") +
    `<dt style="grid-column:1/-1;font-size:12px;color:var(--ink-3)">Thời gian trung bình tính từ lúc gửi file tới lúc xong, gồm cả lúc chờ.</dt>`;
}

// ---------- Bảng có tab ----------

const matches = (j) => {
  const q = state.search.trim().toLowerCase();
  return !q || `${j.label} ${j.name ?? ""} ${j.type ?? ""}`.toLowerCase().includes(q);
};

function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll("#tabs [role=tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
  renderFilters();
  renderTable();
}

function renderFilters() {
  const opts = {
    queue: [],
    history: [["all", "Tất cả"], ["done", "Xong"], ["fail", "Lỗi"], ["cancel", "Đã huỷ"]],
    tools: [["active", "Có job"], ["all", "Tất cả công cụ"]],
  }[state.tab];
  const cur = state.filter[state.tab];
  $("filters").innerHTML = opts.map(([v, label]) => `<button type="button" data-filter="${v}" aria-pressed="${v === cur}">${label}</button>`).join("");
  $("filters").hidden = !opts.length;
}

function emptyState(title, text) {
  return `<div class="empty"><strong>${title}</strong>${text}</div>`;
}

function renderTable() {
  const ov = state.ov;
  $("tab-n-queue").textContent = ov?.totals.pending ?? 0;
  $("tab-n-history").textContent = ov?.recent.length ?? 0;
  if (!ov) { $("table").innerHTML = emptyState("Chưa có số liệu", "Đang chờ API trả lời."); return; }
  const sel = (id) => (id === state.selected ? ' class="is-selected"' : "");
  const online = (w) => ov.workers.some((x) => x.name === w && x.online);
  let html;

  if (state.tab === "queue") {
    const rows = ov.waiting.filter(matches);
    html = rows.length ? `
      <table><thead><tr><th>Công cụ</th><th>File</th><th>Nguồn</th><th>Máy</th><th class="num">Đã chờ</th><th>Ghi chú</th></tr></thead><tbody>
      ${rows.map((j) => `<tr data-job="${esc(j.id)}"${sel(j.id)}>
        <td>${esc(j.label)}</td><td class="cell-file" title="${esc(j.name)}">${esc(j.name)}</td>
        <td class="cell-muted">${esc(j.source)}</td>
        <td>${workerName(j.worker)}</td><td class="num">${dur(j.waitSeconds + sinceFetch())}</td>
        <td>${!online(j.worker) ? `<span class="cell-alert">Máy xử lý đang tắt</span>` : j.attempts > 0 ? `<span class="cell-warn">Bị dừng giữa chừng ${j.attempts} lần, chờ làm lại</span>` : ""}</td>
      </tr>`).join("")}</tbody></table>
      ${ov.totals.pending > ov.waiting.length ? `<p class="empty" style="padding:12px">Chỉ hiện ${ov.waiting.length} job chờ lâu nhất trong ${ov.totals.pending} job.</p>` : ""}`
      : state.search ? emptyState("Không tìm thấy", "Không có job chờ nào khớp với từ khoá.") : emptyState("Hàng chờ trống", "Job mới gửi lên sẽ hiện ở đây.");
  } else if (state.tab === "history") {
    const f = state.filter.history;
    const wanted = { done: "Done", fail: "Failed", cancel: "Cancelled" }[f];
    const rows = ov.recent.filter((j) => (f === "all" || j.status === wanted) && matches(j));
    html = rows.length ? `
      <table><thead><tr><th>Lúc</th><th>Công cụ</th><th>File</th><th>Nguồn</th><th>Kết quả</th><th class="num">Thời gian</th><th>Lỗi</th></tr></thead><tbody>
      ${rows.map((j) => `<tr data-job="${esc(j.id)}"${sel(j.id)}>
        <td class="cell-muted">${ago(j.agoSeconds + sinceFetch())}</td><td>${esc(j.label)}</td>
        <td class="cell-file" title="${esc(j.name)}">${esc(j.name)}</td>
        <td class="cell-muted">${esc(j.source)}</td>
        <td>${statusBadge(j.status)}</td>
        <td class="num">${dur(j.seconds)}${j.attempts > 1 ? `<br><span class="cell-muted">${j.attempts} lượt</span>` : ""}</td>
        <td class="cell-error" title="${esc(j.error)}">${esc(j.error)}</td>
      </tr>`).join("")}</tbody></table>`
      : f === "fail" ? emptyState("Không có job lỗi", "Không có job nào lỗi trong 24 giờ qua.")
      : f === "cancel" ? emptyState("Không có job bị huỷ", "Không có job nào bị huỷ trong 24 giờ qua.")
      : emptyState("Chưa có job nào", "Job xong, lỗi hoặc bị huỷ trong 24 giờ qua sẽ hiện ở đây.");
  } else {
    const rows = ov.types
      .filter((t) => (state.filter.tools === "all" || t.pending + t.processing + t.done24h + t.failed24h > 0) && matches(t))
      .sort((a, b) => (b.pending + b.processing) - (a.pending + a.processing) || (b.done24h + b.failed24h) - (a.done24h + a.failed24h) || a.label.localeCompare(b.label, "vi"));
    html = rows.length ? `
      <table><thead><tr><th>Công cụ</th><th>Máy</th><th class="num">Chờ</th><th class="num">Đang chạy</th><th class="num">Xong 24h</th><th class="num">Lỗi 24h</th><th class="num">Trung bình</th></tr></thead><tbody>
      ${rows.map((t) => `<tr data-type="${esc(t.type)}">
        <td><span class="tool-cell"><span class="dot ${t.online ? "dot--ok" : "dot--bad"}" title="${t.online ? "Máy xử lý đang bật" : "Máy xử lý đang tắt"}"></span>${esc(t.label)}</span></td>
        <td>${workerName(t.worker)}</td><td class="num">${t.pending || "-"}</td><td class="num">${t.processing || "-"}</td>
        <td class="num">${t.done24h || "-"}</td><td class="num${t.failed24h ? " cell-alert" : ""}">${t.failed24h || "-"}</td>
        <td class="num">${t.avgSeconds24h == null ? "-" : dur(t.avgSeconds24h)}</td>
      </tr>`).join("")}</tbody></table>`
      : emptyState("Chưa có công cụ nào được dùng", "Chọn “Tất cả công cụ” để xem cả những công cụ chưa có job.");
  }
  const wrap = $("table"), top = wrap.scrollTop;
  wrap.innerHTML = html;
  wrap.scrollTop = top;
}

// ---------- Ngăn chi tiết job ----------

function findJob(id) {
  const ov = state.ov;
  if (!ov) return null;
  const r = ov.running.find((j) => j.id === id);
  if (r) return { ...r, kind: "run" };
  const w = ov.waiting.find((j) => j.id === id);
  if (w) return { ...w, kind: "wait" };
  const d = ov.recent.find((j) => j.id === id);
  if (d) return { ...d, kind: { Done: "done", Failed: "fail", Cancelled: "cancel" }[d.status] || "fail" };
  return null;
}

function openJob(id) {
  state.selected = id;
  state.confirming = false;
  renderDrawer();
  renderTable();
}

function closeDrawer() {
  state.selected = null;
  renderDrawer();
  renderTable();
}

function renderDrawer() {
  const drawer = $("drawer");
  const j = state.selected && findJob(state.selected);
  if (!state.selected) {
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    return;
  }
  drawer.classList.add("is-open");
  drawer.setAttribute("aria-hidden", "false");
  if (!j) {
    $("drawer-inner").innerHTML = `${drawerHead("Không còn thấy job này", "")}
      <p class="drawer__note">Job có thể đã kết thúc hơn 24 giờ hoặc nằm ngoài danh sách đang hiện.</p>`;
    bindDrawer();
    return;
  }
  const status = {
    wait: `<span class="badge badge--wait">Đang chờ</span>`,
    run: `<span class="badge badge--run">Đang xử lý</span>`,
    done: `<span class="badge badge--done">Xong</span>`,
    fail: `<span class="badge badge--fail">Lỗi</span>`,
    cancel: `<span class="badge badge--muted">Đã huỷ</span>`,
  }[j.kind];
  const rows = [["Trạng thái", status], ["Nguồn", esc(j.source)], ["Máy xử lý", esc(workerName(j.worker))]];
  if (j.batchId) rows.push(["Lô", `<code>${esc(j.batchId.slice(0, 8))}</code>`]);
  if (j.kind === "wait") rows.push(["Đã chờ", dur(j.waitSeconds + sinceFetch())], ["Lượt trước", j.attempts ? `Bị dừng giữa chừng ${j.attempts} lần` : "Chưa chạy lần nào"]);
  if (j.kind === "run") rows.push(["Đã chạy", dur(j.seconds + sinceFetch())], ["Lượt", String(j.attempt)]);
  if (j.kind === "done" || j.kind === "fail" || j.kind === "cancel") rows.push(["Kết thúc", ago(j.agoSeconds + sinceFetch())], ["Tổng thời gian", dur(j.seconds)], ["Số lượt", String(j.attempts)]);

  let actions = "";
  if (j.kind === "fail" || j.kind === "cancel") actions = `<button class="btn btn--primary" type="button" data-act="retry">Thử lại job này</button>`;
  if (j.kind === "wait") {
    actions = state.confirming
      ? `<button class="btn btn--danger" type="button" data-act="cancel">Bấm lần nữa để huỷ</button><button class="btn" type="button" data-act="keep">Không huỷ</button>`
      : `<button class="btn" type="button" data-act="ask-cancel">Huỷ job này</button>`;
  }
  const note = {
    run: "Job đang chạy không huỷ được giữa chừng. Nếu máy xử lý dừng, job tự được giao lại sau khi hết hạn giữ chỗ.",
    fail: "Thử lại sẽ đưa job về cuối hàng chờ, dùng lại file gốc. Công cụ có mật khẩu sẽ thiếu mật khẩu khi thử lại.",
    wait: "Huỷ thì job chuyển sang “đã huỷ”, app gửi job (nếu có) sẽ thấy lý do.",
    cancel: "Thử lại sẽ đưa job về cuối hàng chờ, dùng lại file gốc.",
    done: "",
  }[j.kind];

  $("drawer-inner").innerHTML = `
    ${drawerHead(esc(j.label), esc(j.name))}
    <dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
    ${j.error ? `<div class="drawer__error">${esc(j.error)}</div>` : ""}
    ${actions ? `<div class="drawer__actions">${actions}</div>` : ""}
    ${note ? `<p class="drawer__note">${note}</p>` : ""}
    <div class="idline"><code>${esc(j.id)}</code><button class="btn btn--small" type="button" data-act="copy">Chép mã job</button></div>`;
  bindDrawer(j);
}

function drawerHead(title, file) {
  return `<div class="drawer__head"><div><h2 class="drawer__title">${title}</h2>${file ? `<p class="drawer__file">${file}</p>` : ""}</div>
    <button class="drawer__close" type="button" data-act="close" aria-label="Đóng"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>`;
}

function bindDrawer(j) {
  $("drawer-inner").querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", async () => {
    const act = b.dataset.act;
    if (act === "close") closeDrawer();
    if (act === "copy") {
      try { await navigator.clipboard.writeText(j.id); toast("Đã chép mã job."); } catch { toast("Không chép được mã job.", true); }
    }
    if (act === "ask-cancel") { state.confirming = true; renderDrawer(); }
    if (act === "keep") { state.confirming = false; renderDrawer(); }
    if (act === "retry" || act === "cancel") { b.disabled = true; await jobAction(j.id, act); }
  }));
}

// ---------- Cài đặt, thông báo, phím tắt ----------

function openSettings() {
  $("set-api").value = state.settings.apiUrl;
  $("set-key").value = state.settings.key;
  $("settings").showModal();
}

$("settings").addEventListener("close", () => {
  if ($("settings").returnValue !== "save") return;
  state.settings = { apiUrl: $("set-api").value.trim().replace(/\/+$/, ""), key: $("set-key").value.trim() };
  saveSettings(state.settings);
  state.ov = null; state.err = null; state.samples = []; state.services = [];
  toast("Đã lưu. Đang kết nối lại…");
  render();
});

let toastTimer = 0;
function toast(text, isError = false) {
  const t = $("toast");
  t.textContent = text;
  t.className = `toast is-shown${isError ? " toast--error" : ""}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = "toast"), isError ? 5000 : 2500);
}

$("open-settings").addEventListener("click", openSettings);
$("tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) setTab(b.dataset.tab); });
$("filters").addEventListener("click", (e) => {
  const b = e.target.closest("[data-filter]");
  if (!b) return;
  state.filter[state.tab] = b.dataset.filter;
  renderFilters();
  renderTable();
});
$("search").addEventListener("input", (e) => { state.search = e.target.value; renderTable(); });

// Bấm một job ở bất kỳ đâu (băng chuyền hoặc bảng) để xem chi tiết; bấm một công cụ để lọc theo công cụ đó.
document.addEventListener("click", (e) => {
  const row = e.target.closest("[data-job]");
  if (row) return openJob(row.dataset.job);
  const tool = e.target.closest("[data-type]");
  if (tool) {
    const t = state.ov?.types.find((x) => x.type === tool.dataset.type);
    if (t) { $("search").value = state.search = t.label; setTab(t.pending ? "queue" : "history"); }
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "/" && document.activeElement !== $("search") && !$("settings").open) { e.preventDefault(); $("search").focus(); }
  if (e.key === "Escape" && state.selected && !$("settings").open) closeDrawer();
});

// Mỗi giây: chạy tiếp đồng hồ job và dòng "cập nhật ... trước" mà không cần hỏi lại API.
setInterval(() => { if (state.ov) { renderConn(); renderBelt(); } }, 1000);

setTab("queue");
render();
pollOverview();
pollServices();
