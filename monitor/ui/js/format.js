// Định dạng chữ và số để hiện lên màn hình. Hàm thuần (không đụng tới trang), test được bằng Node.

// Chống chèn HTML: tên file, câu lỗi... luôn đi qua esc() trước khi đưa vào innerHTML.
const HTML_CHARS = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => HTML_CHARS[c]);

const WORKER_NAMES = { main: "Máy chính", ai: "Máy AI", photo: "Máy ảnh RAW" };
export const workerName = (w) => WORKER_NAMES[w] || w;

const STATUS_BADGE = {
  Done: `<span class="badge badge--done">Xong</span>`,
  Failed: `<span class="badge badge--fail">Lỗi</span>`,
  Cancelled: `<span class="badge badge--muted">Đã huỷ</span>`,
};
// Nhãn trạng thái job đã kết thúc (Done / Failed / Cancelled của API).
export const statusBadge = (s) => STATUS_BADGE[s] || esc(s);

// 3725 -> "1 giờ 2 phút"; 65 -> "1 phút 5 giây"
export function dur(s) {
  s = Math.max(0, Math.round(s));
  if (s < 60) return `${s} giây`;
  if (s < 3600) return `${Math.floor(s / 60)} phút${s % 60 ? ` ${s % 60} giây` : ""}`;
  const m = Math.floor((s % 3600) / 60);
  return `${Math.floor(s / 3600)} giờ${m ? ` ${m} phút` : ""}`;
}

// Như dur() nhưng gọn hơn: bỏ giây khi đã quá một phút.
export function shortDur(s) {
  s = Math.max(0, Math.round(s));
  if (s < 60) return `${s} giây`;
  if (s < 3600) return `${Math.floor(s / 60)} phút`;
  return `${Math.floor(s / 3600)} giờ ${Math.floor((s % 3600) / 60)} phút`;
}

export const ago = (s) => (s < 5 ? "vừa xong" : `${shortDur(s)} trước`);

// Đồng hồ: 75 -> "1:15"; 3725 -> "1:02:05"
export function clock(s) {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  const ss = String(sec).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// 1536 -> "1,5 KB"
export function bytes(b) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (b >= 1024 && i < units.length - 1) {
    b /= 1024;
    i++;
  }
  return `${b.toFixed(i ? 1 : 0).replace(".", ",")} ${units[i]}`;
}

// "http://may-chu:5100/" -> "may-chu:5100"; địa chỉ sai thì trả nguyên.
export function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
