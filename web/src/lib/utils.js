// Các hàm nhỏ dùng ở nhiều nơi.

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

// Bỏ dấu tiếng Việt để tìm kiếm: "Nén" khớp với "nen".
export function plain(text) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

// Đuôi file viết thường, ví dụ "Báo cáo.PDF" -> ".pdf"
export function extOf(name) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

// Tên file bỏ đuôi, ví dụ "bao-cao.pdf" -> "bao-cao"
export function stemOf(name) {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

// Cho người dùng tải về dữ liệu tạo ngay trên trình duyệt (không qua máy chủ).
export function downloadBlob(data, filename, type = "application/octet-stream") {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// "1,3,5-7" -> [1,3,5,6,7] (số trang bắt đầu từ 1); số trang ngoài phạm vi bị bỏ qua.
export function parsePages(text, pageCount) {
  const pages = [];
  for (const part of text.split(",").map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d+)\s*(?:-\s*(\d+))?$/);
    if (!m) throw new Error(`"${part}" không đúng dạng. Ví dụ đúng: 1,3,5-7`);
    const from = Number(m[1]);
    const to = m[2] ? Number(m[2]) : from;
    if (to < from) throw new Error(`Đoạn "${part}" bị ngược: số đầu phải nhỏ hơn số sau.`);
    for (let p = from; p <= to; p++) if (p >= 1 && p <= pageCount) pages.push(p);
  }
  return pages;
}

// "Giữ" con trỏ chuột/ngón tay cho phần tử đang kéo, để kéo ra ngoài vẫn nhận được sự kiện.
// Một số trình duyệt/thiết bị báo lỗi khi gọi: bỏ qua lỗi, thao tác vẫn chạy bình thường.
export function capturePointer(element, pointerId) {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    /* không sao */
  }
}
