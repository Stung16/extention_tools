import { useState } from "react";
import { Link } from "react-router-dom";
import { PDFCheckBox, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFTextField } from "pdf-lib";
import FileDrop from "../components/FileDrop";
import { embedVietFont, loadForEdit } from "../lib/pdf";
import { downloadBlob, stemOf } from "../lib/utils";

// Điền biểu mẫu PDF (các ô điền sẵn trong file), chạy trên trình duyệt.
// Dùng phông Be Vietnam Pro để chữ tiếng Việt hiện đúng trong ô.
export default function FillPdf() {
  const [file, setFile] = useState(null);
  const [fields, setFields] = useState([]); // [{ name, kind, value, options }]
  const [flatten, setFlatten] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function pick([f]) {
    setError("");
    try {
      const doc = await loadForEdit(new Uint8Array(await f.arrayBuffer()));
      const list = doc.getForm().getFields().map((field) => {
        const name = field.getName();
        if (field instanceof PDFTextField) return { name, kind: "text", value: field.getText() || "", multiline: field.isMultiline() };
        if (field instanceof PDFCheckBox) return { name, kind: "check", value: field.isChecked() };
        if (field instanceof PDFDropdown || field instanceof PDFOptionList)
          return { name, kind: "select", value: field.getSelected()[0] || "", options: field.getOptions() };
        if (field instanceof PDFRadioGroup) return { name, kind: "select", value: field.getSelected() || "", options: field.getOptions() };
        return { name, kind: "other" };
      }).filter((x) => x.kind !== "other");
      setFile(f);
      setFields(list);
    } catch (e) {
      setError(e.message);
    }
  }

  const setValue = (i, value) => setFields((old) => old.map((x, k) => (k === i ? { ...x, value } : x)));

  async function save() {
    setBusy(true);
    setError("");
    try {
      const doc = await loadForEdit(new Uint8Array(await file.arrayBuffer()));
      const form = doc.getForm();
      for (const f of fields) {
        const field = form.getField(f.name);
        if (f.kind === "text") {
          field.setText(f.value);
          // Tự đặt cỡ chữ theo chiều cao ô: cỡ tự động của pdf-lib quá to với phông có dấu,
          // làm mất phần dưới chữ (dấu nặng, chân chữ g, y).
          const height = field.acroField.getWidgets()[0]?.getRectangle().height ?? 20;
          if (!f.multiline) field.setFontSize(Math.max(7, Math.min(14, Math.round(height * 0.5))));
        }
        else if (f.kind === "check") (f.value ? field.check() : field.uncheck());
        else if (f.kind === "select" && f.value) {
          field.select(f.value);
          // Ô chọn dạng danh sách cũng tự đặt cỡ chữ như ô chữ (ô dạng nút tròn thì không cần).
          if (typeof field.setFontSize === "function") {
            const height = field.acroField.getWidgets()[0]?.getRectangle().height ?? 20;
            field.setFontSize(Math.max(7, Math.min(14, Math.round(height * 0.5))));
          }
        }
      }
      // Vẽ lại hình các ô bằng phông có tiếng Việt (phông mặc định của PDF không có chữ "ệ", "ở"...).
      form.updateFieldAppearances(await embedVietFont(doc));
      if (flatten) form.flatten(); // biến chữ đã điền thành nội dung cố định, không sửa được nữa
      const bytes = await doc.save({ updateFieldAppearances: false });
      downloadBlob(bytes, `${stemOf(file.name)}-da-dien.pdf`, "application/pdf");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!file) return <div className="panel"><FileDrop accept={[".pdf"]} maxMB={null} onFiles={pick} />{error && <p className="error-text">{error}</p>}</div>;

  if (!fields.length) {
    return (
      <div className="panel">
        <div className="soon-box">
          <h2>File này không có ô biểu mẫu để điền</h2>
          <p>Bạn vẫn có thể gõ chữ lên bất kỳ chỗ nào của PDF bằng công cụ <Link to="/sua-pdf">Sửa PDF</Link>.</p>
          <button type="button" className="btn secondary" onClick={() => setFile(null)}>Chọn file khác</button>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <p className="hint-line">File có {fields.length} ô. Tên ô do người tạo biểu mẫu đặt.</p>
      {fields.map((f, i) => (
        <div className="option" key={f.name}>
          {f.kind === "check" ? (
            <label className="choice"><input type="checkbox" checked={f.value} onChange={(e) => setValue(i, e.target.checked)} /> {f.name}</label>
          ) : (
            <>
              <label className="option-label" htmlFor={"f" + i}>{f.name}</label>
              {f.kind === "select" ? (
                <select id={"f" + i} className="text-input" value={f.value} onChange={(e) => setValue(i, e.target.value)}>
                  <option value="">(chưa chọn)</option>
                  {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : f.multiline ? (
                <textarea id={"f" + i} className="text-input" rows={3} value={f.value} onChange={(e) => setValue(i, e.target.value)} />
              ) : (
                <input id={"f" + i} className="text-input" value={f.value} onChange={(e) => setValue(i, e.target.value)} />
              )}
            </>
          )}
        </div>
      ))}
      <label className="choice"><input type="checkbox" checked={flatten} onChange={(e) => setFlatten(e.target.checked)} /> Khoá nội dung sau khi điền (không cho sửa nữa)</label>
      {error && <p className="error-text">{error}</p>}
      <div className="row-buttons">
        <button className="btn secondary" type="button" onClick={() => setFile(null)}>Chọn file khác</button>
        <button className="btn" type="button" disabled={busy} onClick={save}>{busy ? "Đang lưu..." : "Lưu PDF đã điền"}</button>
      </div>
    </div>
  );
}
