// Tính những gì cần hiện từ số liệu API: cảnh báo, các dòng bảng, biểu đồ, chi tiết job.
// Hàm thuần: nhận dữ liệu, trả dữ liệu (không đụng tới trang), test được bằng Node (tests-ui/).
//
//   ov     số liệu GET /api/admin/overview: { totals, last24h, workers, waiting, running, recent, types, storage,
//          oldestPendingSeconds }
//   since  số giây từ lúc nhận ov tới giờ (cộng vào thời gian chờ/chạy để đồng hồ chạy tiếp)

import { ago, bytes, dur, esc, hostOf, shortDur, workerName } from "./format.js";

export const LEASE_SECONDS = 120; // hạn giữ job của API (JobLeaseSeconds), để vẽ thanh "giữ chỗ còn"
export const SAMPLE_WINDOW_MS = 30 * 60 * 1000; // biểu đồ giữ 30 phút gần nhất
const SLOW_WAIT_SECONDS = 300; // job chờ quá 5 phút mà máy vẫn bật: có thể quá tải

const isOnline = (ov, worker) => ov.workers.some((w) => w.name === worker && w.online);

// Thêm một điểm cho biểu đồ, bỏ điểm cũ hơn 30 phút.
export function addSample(samples, ov, now) {
  const next = [...samples, { t: now, wait: ov.totals.pending, run: ov.totals.processing }];
  return next.filter((s) => now - s.t <= SAMPLE_WINDOW_MS);
}

// Thời hạn giữ chỗ của job đang chạy: { left (giây, null nếu không rõ), late (đã quá hạn), pct (độ dài thanh) }.
export function leaseInfo(job, since) {
  if (job.leaseSecondsLeft == null) return { left: null, late: false, pct: 0 };
  const left = job.leaseSecondsLeft - since;
  return { left, late: left < 0, pct: Math.max(0, Math.min(100, (left / LEASE_SECONDS) * 100)) };
}

// ---------- Dải cảnh báo trên cùng ----------

// [{ level: "error" | "warn" | "info", html, action?: { label, run: "settings" | "failed" } }]
export function attentionItems({ ov, err, services }, since) {
  const items = [];
  if (err) items.push({ level: "error", html: esc(err), action: { label: "Mở cài đặt", run: "settings" } });
  if (ov) {
    for (const w of ov.workers) {
      if (!w.online && w.pending > 0) {
        items.push({
          level: "error",
          html: `<strong>${w.pending} job</strong> đang chờ ${workerName(w.name)}, nhưng máy này đang tắt. Bật worker ${esc(w.name)} để xử lý tiếp.`,
        });
      }
    }
    const late = ov.running.filter((j) => leaseInfo(j, since).late);
    if (late.length) {
      items.push({
        level: "warn",
        html: `${late.length} job đang chạy đã quá hạn giữ chỗ: máy xử lý có thể đã dừng, job sẽ được giao lại.`,
      });
    }
    if (ov.oldestPendingSeconds > SLOW_WAIT_SECONDS && ov.workers.some((w) => w.online)) {
      items.push({
        level: "warn",
        html: `Có job đã chờ ${shortDur(ov.oldestPendingSeconds)}. Máy xử lý có thể đang quá tải.`,
      });
    }
  }
  for (const s of services) {
    if (s.required && !s.up) {
      items.push({ level: "warn", html: `<strong>${esc(s.name)}</strong> không chạy: ${esc(s.affects)} sẽ lỗi.` });
    }
  }
  if (ov && ov.last24h.failed > 0) {
    items.push({
      level: "info",
      html: `${ov.last24h.failed} job lỗi trong 24 giờ qua.`,
      action: { label: "Xem job lỗi", run: "failed" },
    });
  }
  return items;
}

// ---------- Cột bên: máy xử lý, dịch vụ, con số chung, biểu đồ ----------

// [{ ok, warn, bad, name, sub (đã esc), ms }]: ok = chấm xanh, warn = chấm xám, còn lại chấm đỏ.
export function healthRows({ ov, err, services, settings }) {
  const rows = [];
  rows.push(
    err
      ? { ok: false, name: "API", sub: "Không kết nối được", ms: "" }
      : { ok: !!ov, name: "API", sub: ov ? `Đang chạy ở ${esc(hostOf(settings.apiUrl))}` : "Đang kết nối…", ms: "" },
  );
  for (const w of ov?.workers ?? []) {
    let sub;
    if (w.online) {
      const work = w.processing ? `Đang làm ${w.processing} job` : "Đang rảnh";
      sub = `Đang bật. ${work}${w.pending ? `, ${w.pending} job chờ` : ""}.`;
    } else if (w.lastSeenSecondsAgo != null) sub = `Đang tắt, lần cuối thấy ${ago(w.lastSeenSecondsAgo)}.`;
    else sub = "Đang tắt.";
    // Máy tắt mà không có job chờ thì chỉ là chấm xám (chưa cần lo).
    rows.push({
      ok: w.online,
      warn: !w.online && w.pending === 0,
      name: `${workerName(w.name)} (worker ${w.name})`,
      sub,
      ms: "",
    });
  }
  for (const s of services) {
    let sub;
    if (s.up) sub = s.required ? "Đang chạy" : `Đang chạy (${esc(s.affects)})`;
    else sub = `${esc(s.detail)}${s.required ? "" : `, ${esc(s.affects)}`}`;
    rows.push({
      ok: s.up,
      warn: !s.up && !s.required,
      bad: !s.up && s.required,
      name: s.name,
      sub,
      ms: s.up ? `${s.millis} ms` : "",
    });
  }
  return rows;
}

// [[nhãn, giá trị]]
export function facts(ov, since) {
  return [
    ["Chờ lâu nhất", ov.oldestPendingSeconds == null ? "Không có" : dur(ov.oldestPendingSeconds + since)],
    ["Thời gian trung bình", ov.last24h.avgSeconds == null ? "Chưa có" : dur(ov.last24h.avgSeconds)],
    ["File đang lưu", `${ov.storage.files} file, ${bytes(ov.storage.bytes)}`],
    ["Từ trước tới nay", `${ov.totals.done} xong, ${ov.totals.failed} lỗi`],
  ];
}

// Toạ độ hai đường biểu đồ (chờ, đang xử lý) trong khung width x height. null nếu chưa đủ 2 điểm.
export function chartData(samples, width = 300, height = 92, pad = 4) {
  if (samples.length < 2) return null;
  const t0 = samples[0].t;
  const t1 = samples[samples.length - 1].t;
  const peak = Math.max(...samples.map((p) => Math.max(p.wait, p.run)));
  const max = Math.max(3, peak); // ít nhất 3 vạch để đường không dựng đứng khi chỉ có 0-1 job
  const x = (t) => pad + ((t - t0) / Math.max(1, t1 - t0)) * (width - pad * 2);
  const y = (v) => height - pad - (v / max) * (height - pad * 2);
  const line = (key) => samples.map((p) => `${x(p.t).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");
  return {
    width,
    height,
    wait: line("wait"),
    run: line("run"),
    top: y(max),
    bottom: y(0),
    peak,
    last: samples[samples.length - 1],
    minutes: Math.max(1, Math.round((t1 - t0) / 60000)),
  };
}

// ---------- Bảng có tab ----------

// Ô tìm kiếm: khớp tên công cụ, tên file hoặc mã loại job (không phân biệt hoa thường).
export function matches(item, search) {
  const q = search.trim().toLowerCase();
  return !q || `${item.label} ${item.name ?? ""} ${item.type ?? ""}`.toLowerCase().includes(q);
}

export function queueRows(ov, search) {
  return ov.waiting.filter((j) => matches(j, search)).map((j) => ({ ...j, workerOnline: isOnline(ov, j.worker) }));
}

const HISTORY_STATUS = { done: "Done", fail: "Failed", cancel: "Cancelled" };

// filter: "all" | "done" | "fail" | "cancel"
export function historyRows(ov, filter, search) {
  const wanted = HISTORY_STATUS[filter];
  return ov.recent.filter((j) => (filter === "all" || j.status === wanted) && matches(j, search));
}

// filter: "active" (chỉ công cụ có job) | "all". Xếp: đang có việc trước, rồi nhiều job 24 giờ, rồi theo tên.
export function toolRows(ov, filter, search) {
  const busy = (t) => t.pending + t.processing;
  const used = (t) => t.done24h + t.failed24h;
  return ov.types
    .filter((t) => (filter === "all" || busy(t) + used(t) > 0) && matches(t, search))
    .sort((a, b) => busy(b) - busy(a) || used(b) - used(a) || a.label.localeCompare(b.label, "vi"));
}

// ---------- Ngăn chi tiết job ----------

const FINISHED_KIND = { Done: "done", Failed: "fail", Cancelled: "cancel" };

// Tìm job ở mọi danh sách. kind: "run" | "wait" | "done" | "fail" | "cancel". Không thấy: null.
export function findJob(ov, id) {
  if (!ov || !id) return null;
  const run = ov.running.find((j) => j.id === id);
  if (run) return { ...run, kind: "run" };
  const wait = ov.waiting.find((j) => j.id === id);
  if (wait) return { ...wait, kind: "wait" };
  const done = ov.recent.find((j) => j.id === id);
  if (done) return { ...done, kind: FINISHED_KIND[done.status] || "fail" };
  return null;
}

// Các dòng thông tin [nhãn, giá trị (đã esc)] trong ngăn chi tiết, trừ dòng trạng thái.
export function jobDetails(j, since) {
  const rows = [
    ["Nguồn", esc(j.source)],
    ["Máy xử lý", esc(workerName(j.worker))],
  ];
  if (j.batchId) rows.push(["Lô", `<code>${esc(j.batchId.slice(0, 8))}</code>`]);
  if (j.kind === "wait") {
    rows.push(["Đã chờ", dur(j.waitSeconds + since)]);
    rows.push(["Lượt trước", j.attempts ? `Bị dừng giữa chừng ${j.attempts} lần` : "Chưa chạy lần nào"]);
  }
  if (j.kind === "run") rows.push(["Đã chạy", dur(j.seconds + since)], ["Lượt", String(j.attempt)]);
  if (j.kind === "done" || j.kind === "fail" || j.kind === "cancel") {
    rows.push(
      ["Kết thúc", ago(j.agoSeconds + since)],
      ["Tổng thời gian", dur(j.seconds)],
      ["Số lượt", String(j.attempts)],
    );
  }
  return rows;
}

// Thao tác làm được với job: "retry" (lỗi / đã huỷ), "cancel" (đang chờ), hoặc không có.
export function jobAction(kind) {
  if (kind === "fail" || kind === "cancel") return "retry";
  if (kind === "wait") return "cancel";
  return null;
}

export const JOB_NOTES = {
  run: "Job đang chạy không huỷ được giữa chừng. Nếu máy xử lý dừng, job tự được giao lại sau khi hết hạn giữ chỗ.",
  fail: "Thử lại sẽ đưa job về cuối hàng chờ, dùng lại file gốc. Công cụ có mật khẩu sẽ thiếu mật khẩu khi thử lại.",
  wait: "Huỷ thì job chuyển sang “đã huỷ”, app gửi job (nếu có) sẽ thấy lý do.",
  cancel: "Thử lại sẽ đưa job về cuối hàng chờ, dùng lại file gốc.",
  done: "",
};
