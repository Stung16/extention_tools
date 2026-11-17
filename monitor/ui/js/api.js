// MỌI lệnh gọi sang phần Rust (src/commands.rs) nằm ở đây. Rust gọi API thay cho giao diện.

const invoke = globalThis.__TAURI__?.core?.invoke;

// false khi mở index.html bằng trình duyệt thường (không qua app): không gọi được Rust.
export const hasTauri = Boolean(invoke);

// Số liệu tổng quan (JSON của GET /api/admin/overview). Lỗi: ném chuỗi câu báo tiếng Việt.
export function fetchOverview(settings) {
  return invoke("overview", { apiUrl: settings.apiUrl, key: settings.key });
}

// action: "retry" (thử lại job lỗi / đã huỷ) hoặc "cancel" (huỷ job đang chờ).
export function runJobAction(settings, id, action) {
  return invoke("job_action", { apiUrl: settings.apiUrl, key: settings.key, id, action });
}

// targets: [{ name, url }] -> [{ name, url, up, millis, detail }] (cùng thứ tự).
export function checkServices(targets) {
  return invoke("check_services", { targets: targets.map(({ name, url }) => ({ name, url })) });
}
