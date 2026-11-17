// MỌI lệnh gọi API .NET của trang web nằm ở đây (cửa "trang web công cụ": /api/job-types, /api/jobs).
// Đổi địa chỉ, tên trường JSON... thì chỉ sửa file này.

// Danh sách loại job API hỗ trợ, dạng { "compress-pdf": { label, extensions, options, input, online, ... } }.
// API tắt hoặc lỗi: trả {} (trang vẫn hiện, công cụ cần máy chủ báo "Sắp có").
export async function fetchJobTypes() {
  try {
    const r = await fetch("/api/job-types");
    if (!r.ok) return {};
    const list = await r.json();
    return Object.fromEntries(list.map((t) => [t.type, t]));
  } catch {
    return {};
  }
}

// Tạo job (gửi file + tuỳ chọn). Trả về { id }.
// Dùng XMLHttpRequest vì fetch chưa báo được phần trăm tải lên. onProgress nhận số từ 0 tới 1.
export function createJob(formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/jobs");
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    });
    xhr.addEventListener("load", () => {
      const data = parseJson(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.error || `Máy chủ báo lỗi (${xhr.status}).`));
    });
    xhr.addEventListener("error", () => reject(new Error("Mất kết nối khi tải file lên.")));
    xhr.send(formData);
  });
}

// Trạng thái job: { status: "Pending" | "Processing" | "Done" | "Failed" | "Cancelled", error, inputSize, outputSize,
// outputExt, workerOnline, ... }
export async function getJob(id) {
  const r = await fetch(`/api/jobs/${id}`);
  if (!r.ok) throw new Error(`Không xem được trạng thái (${r.status}).`);
  return r.json();
}

// Địa chỉ tải file kết quả.
export const outputUrl = (id) => `/api/jobs/${id}/output`;

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return {}; // không phải JSON (ví dụ trang lỗi của máy chủ)
  }
}
