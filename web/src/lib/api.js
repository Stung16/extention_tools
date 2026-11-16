// Gọi API .NET: lấy danh sách loại job, tạo job (tải file lên), hỏi trạng thái.

let jobTypesPromise = null;

// Danh sách loại job API hỗ trợ: { "compress-pdf": {label, extensions, options, online, ...}, ... }
// Gọi nhiều lần cũng chỉ hỏi API một lần.
export function loadJobTypes() {
  if (!jobTypesPromise) {
    jobTypesPromise = fetch("/api/job-types")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => Object.fromEntries(list.map((t) => [t.type, t])))
      .catch(() => ({})); // API tắt: trang vẫn hiện, công cụ cần máy chủ sẽ báo "Sắp có"
  }
  return jobTypesPromise;
}

// Tạo job. Dùng XMLHttpRequest vì fetch chưa báo được phần trăm tải lên.
export function createJob(formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/jobs");
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    });
    xhr.addEventListener("load", () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* không phải JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.error || `Máy chủ báo lỗi (${xhr.status}).`));
    });
    xhr.addEventListener("error", () => reject(new Error("Mất kết nối khi tải file lên.")));
    xhr.send(formData);
  });
}

export async function getJob(id) {
  const r = await fetch(`/api/jobs/${id}`);
  if (!r.ok) throw new Error(`Không xem được trạng thái (${r.status}).`);
  return r.json();
}

export const outputUrl = (id) => `/api/jobs/${id}/output`;
