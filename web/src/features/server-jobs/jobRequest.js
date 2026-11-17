// Chuẩn bị yêu cầu gửi lên máy chủ: giá trị ban đầu của tuỳ chọn, kiểm tra trước khi gửi, tạo form.
// Hàm thuần (không React) nên test được. API vẫn kiểm tra lại mọi thứ; ở đây chỉ để báo lỗi sớm cho người dùng.
//
//   type    loại job lấy từ API: { input: "file" | "url" | "none", options: [...], urlPattern, extensions }
//   option  { name, label, kind: "choice" | "text" | "textarea" | "password", choices, default, required,
//             maxLength, pattern, hint } (khai báo trong api/src/CongCuFile.Domain/Catalog/JobCatalog.cs)

const hasChoices = (option) => Boolean(option.choices?.length);

// Giá trị ban đầu cho mọi tuỳ chọn: lựa chọn mặc định, ô nhập để trống.
export function defaultValues(options = []) {
  return Object.fromEntries(options.map((o) => [o.name, hasChoices(o) ? o.default : ""]));
}

// Xoá mật khẩu đã gõ (sau khi xử lý xong, không để lại trên trang).
export function withoutPasswords(options = [], values) {
  const cleared = options.filter((o) => o.kind === "password").map((o) => [o.name, ""]);
  return { ...values, ...Object.fromEntries(cleared) };
}

// Kiểm tra tuỳ chọn. Trả về câu báo lỗi hoặc "" nếu hợp lệ.
export function checkValues(options = [], values) {
  for (const o of options) {
    if (hasChoices(o)) continue;
    // Mật khẩu giữ nguyên dấu cách đầu/cuối; ô chữ khác bỏ dấu cách thừa.
    const v = o.kind === "password" ? values[o.name] : (values[o.name] || "").trim();
    if (!v) {
      if (o.required) return `Vui lòng nhập: ${o.label}.`;
      continue;
    }
    if (o.maxLength && v.length > o.maxLength) return `${o.label}: tối đa ${o.maxLength} ký tự.`;
    if (o.pattern && !new RegExp(o.pattern).test(v)) return `${o.label} không đúng dạng. ${o.hint || ""}`.trim();
  }
  return "";
}

// Kiểm tra cả yêu cầu: có file / link hợp lệ chưa, tuỳ chọn đúng chưa.
export function checkRequest(type, { file, url }, values) {
  const input = type.input || "file";
  if (input === "url") {
    if (!url.trim()) return "Vui lòng dán đường link.";
    if (type.urlPattern && !new RegExp(type.urlPattern).test(url.trim()))
      return "Đường link không hợp lệ cho công cụ này.";
  } else if (input === "file" && !file) {
    return "Vui lòng chọn file.";
  }
  return checkValues(type.options, values);
}

// Tạo form gửi lên POST /api/jobs: type, file hoặc url, rồi từng tuỳ chọn (ô để trống thì không gửi).
export function buildJobForm(jobType, type, { file, url }, values) {
  const input = type.input || "file";
  const data = new FormData();
  data.append("type", jobType);
  if (input === "url") data.append("url", url.trim());
  if (input === "file") data.append("file", file);
  for (const o of type.options || []) {
    if (values[o.name] !== "" && values[o.name] != null) data.append(o.name, values[o.name]);
  }
  return data;
}
