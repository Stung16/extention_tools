import { useState } from "react";

// Một tuỳ chọn của công cụ (khai báo trong api/JobCatalog.cs):
//   - có danh sách lựa chọn: nhóm nút tròn (ví dụ mức nén)
//   - kind "text": ô nhập một dòng (số trang, chữ watermark...)
//   - kind "textarea": ô nhập nhiều dòng, có đếm số ký tự (văn bản cần đọc, lời bài hát...)
//   - kind "password": ô mật khẩu, chữ bị che, có nút "Hiện"
export default function OptionField({ option, value, onChange, first = false }) {
  const [show, setShow] = useState(false);
  const cls = "option" + (first ? " first" : "");

  if (option.choices?.length) {
    return (
      <fieldset className={cls}>
        <legend>{option.label}</legend>
        <div className="choices">
          {option.choices.map((c) => (
            <label key={c.value} className={"choice" + (value === c.value ? " checked" : "")}>
              <input type="radio" name={option.name} value={c.value} checked={value === c.value}
                     onChange={() => onChange(c.value)} />
              {c.label}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  if (option.kind === "textarea") {
    return (
      <div className={cls}>
        <label className="option-label" htmlFor={"opt-" + option.name}>
          {option.label}{option.required ? " *" : ""}
        </label>
        <textarea id={"opt-" + option.name} className="text-input" rows={option.maxLength > 1000 ? 8 : 3}
                  name={option.name} value={value} placeholder={option.placeholder || ""} maxLength={option.maxLength}
                  onChange={(e) => onChange(e.target.value)} />
        <small className="option-hint">
          {option.hint ? option.hint + " · " : ""}{value.length}/{option.maxLength} ký tự
        </small>
      </div>
    );
  }

  const isPassword = option.kind === "password";
  return (
    <div className={cls}>
      <label className="option-label" htmlFor={"opt-" + option.name}>
        {option.label}{option.required ? " *" : ""}
      </label>
      <div className="text-row">
        <input
          id={"opt-" + option.name}
          className="text-input"
          type={isPassword && !show ? "password" : "text"}
          name={option.name}
          value={value}
          placeholder={option.placeholder || ""}
          maxLength={option.maxLength}
          autoComplete={isPassword ? "new-password" : "off"}
          onChange={(e) => onChange(e.target.value)}
        />
        {isPassword && (
          <button type="button" className="toggle" onClick={() => setShow(!show)}>{show ? "Ẩn" : "Hiện"}</button>
        )}
      </div>
      {option.hint && <small className="option-hint">{option.hint}</small>}
    </div>
  );
}

// Giá trị ban đầu cho mọi tuỳ chọn: lựa chọn mặc định, ô nhập để trống.
export function defaultValues(options = []) {
  return Object.fromEntries(options.map((o) => [o.name, o.choices?.length ? o.default : ""]));
}

// Kiểm tra trước khi gửi. Trả về câu báo lỗi hoặc "" nếu hợp lệ. (API vẫn kiểm tra lại.)
export function checkValues(options = [], values) {
  for (const o of options) {
    if (o.choices?.length) continue;
    const v = o.kind === "password" ? values[o.name] : (values[o.name] || "").trim();
    if (!v) {
      if (o.required) return `Vui lòng nhập: ${o.label}.`;
      continue;
    }
    if (v.length > o.maxLength) return `${o.label}: tối đa ${o.maxLength} ký tự.`;
    if (o.pattern && !new RegExp(o.pattern).test(v)) return `${o.label} không đúng dạng. ${o.hint || ""}`.trim();
  }
  return "";
}
