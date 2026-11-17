// Làm việc với file người dùng chọn: đuôi, tên, kiểm tra trước khi nhận, tải kết quả về máy.

// Giới hạn mỗi file gửi lên máy chủ (khớp giới hạn form 100 MB của API).
export const MAX_UPLOAD_MB = 100;

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

// Kiểm tra danh sách file trước khi nhận. Trả về câu báo lỗi, hoặc "" nếu hợp lệ.
//   accept  danh sách đuôi được nhận (null = nhận mọi loại)
//   maxMB   dung lượng tối đa mỗi file (null = không giới hạn, dùng cho công cụ chạy trên trình duyệt)
export function checkFiles(files, accept, maxMB) {
  const wrongType = accept && files.find((f) => !accept.includes(extOf(f.name)));
  if (wrongType) return `"${wrongType.name}" không đúng loại. Công cụ này nhận: ${accept.join(", ")}`;
  const tooBig = maxMB && files.find((f) => f.size > maxMB * 1024 * 1024);
  if (tooBig) return `"${tooBig.name}" quá lớn. Tối đa ${maxMB} MB mỗi file.`;
  return "";
}

// Đọc toàn bộ file thành mảng byte (để pdf-lib xử lý).
export async function readBytes(file) {
  return new Uint8Array(await file.arrayBuffer());
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
