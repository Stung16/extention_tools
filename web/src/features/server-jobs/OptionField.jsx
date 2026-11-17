import { useState } from "react";
import ChoiceGroup from "@/shared/components/ChoiceGroup";

// Một tuỳ chọn của công cụ (khai báo trong api/src/CongCuFile.Domain/Catalog/JobCatalog.cs):
//   - có danh sách lựa chọn: nhóm nút tròn (ví dụ mức nén)
//   - kind "text": ô nhập một dòng (số trang, chữ watermark...)
//   - kind "textarea": ô nhập nhiều dòng, có đếm số ký tự (văn bản cần đọc...)
//   - kind "password": ô mật khẩu, chữ bị che, có nút "Hiện"
export default function OptionField({ option, value, onChange, first = false }) {
  const [show, setShow] = useState(false);
  const id = "opt-" + option.name;
  const cls = "option" + (first ? " first" : "");
  const label = (
    <label className="option-label" htmlFor={id}>
      {option.label}
      {option.required ? " *" : ""}
    </label>
  );

  if (option.choices?.length) {
    return (
      <ChoiceGroup
        legend={option.label}
        name={option.name}
        options={option.choices}
        value={value}
        onChange={onChange}
        first={first}
      />
    );
  }

  if (option.kind === "textarea") {
    return (
      <div className={cls}>
        {label}
        <textarea
          id={id}
          className="text-input"
          rows={option.maxLength > 1000 ? 8 : 3}
          name={option.name}
          value={value}
          placeholder={option.placeholder || ""}
          maxLength={option.maxLength}
          onChange={(e) => onChange(e.target.value)}
        />
        <small className="option-hint">
          {option.hint ? option.hint + " · " : ""}
          {value.length}/{option.maxLength} ký tự
        </small>
      </div>
    );
  }

  const isPassword = option.kind === "password";
  return (
    <div className={cls}>
      {label}
      <div className="text-row">
        <input
          id={id}
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
          <button type="button" className="toggle" onClick={() => setShow(!show)}>
            {show ? "Ẩn" : "Hiện"}
          </button>
        )}
      </div>
      {option.hint && <small className="option-hint">{option.hint}</small>}
    </div>
  );
}
