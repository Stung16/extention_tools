// Định dạng số để hiện cho người dùng.

// 5770758 -> "5,5 MB"
export function formatSize(bytes) {
  if (bytes == null) return "";
  if (bytes < 1024) return bytes + " B";
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return value.toLocaleString("vi-VN", { maximumFractionDigits: value < 10 ? 1 : 0 }) + " " + units[i];
}

// Số giây -> "phút:giây,phần mười", ví dụ 75.5 -> "1:15.5"
export function formatClock(seconds) {
  const m = Math.floor(seconds / 60);
  return `${m}:${(seconds - m * 60).toFixed(1).padStart(4, "0")}`;
}
