import { useState } from "react";
import { Link } from "react-router-dom";
import { ErrorText } from "@/shared/components/Messages";
import PickFilePanel from "@/shared/components/PickFilePanel";
import useTask from "@/shared/hooks/useTask";
import { downloadBlob, readBytes, stemOf } from "@/shared/lib/files";
import { fillForm, readFormFields } from "./operations/fillForm";
import { loadVietFont } from "./pdfDocument";

// Điền biểu mẫu PDF (các ô điền sẵn trong file), chạy trên trình duyệt.
// Dùng phông Be Vietnam Pro để chữ tiếng Việt hiện đúng trong ô.
export default function FillPdf() {
  const [file, setFile] = useState(null); // { file, bytes }
  const [fields, setFields] = useState([]); // xem readFormFields
  const [flatten, setFlatten] = useState(false);
  const { busy, error, setError, run } = useTask();

  async function pick([f]) {
    setError("");
    try {
      const bytes = await readBytes(f);
      setFields(await readFormFields(bytes));
      setFile({ file: f, bytes });
    } catch (e) {
      setError(e.message);
    }
  }

  const setValue = (i, value) => setFields((old) => old.map((x, k) => (k === i ? { ...x, value } : x)));

  const save = () =>
    run(async () => {
      const bytes = await fillForm(file.bytes, fields, { fontBytes: await loadVietFont(), flatten });
      downloadBlob(bytes, `${stemOf(file.file.name)}-da-dien.pdf`, "application/pdf");
    });

  if (!file) return <PickFilePanel onFiles={pick} error={error} />;

  if (!fields.length) {
    return (
      <div className="panel">
        <div className="soon-box">
          <h2>File này không có ô biểu mẫu để điền</h2>
          <p>
            Bạn vẫn có thể gõ chữ lên bất kỳ chỗ nào của PDF bằng công cụ <Link to="/sua-pdf">Sửa PDF</Link>.
          </p>
          <button type="button" className="btn secondary" onClick={() => setFile(null)}>
            Chọn file khác
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <p className="hint-line">File có {fields.length} ô. Tên ô do người tạo biểu mẫu đặt.</p>
      {fields.map((f, i) => (
        <div className="option" key={f.name}>
          <FieldInput field={f} id={"f" + i} onChange={(v) => setValue(i, v)} />
        </div>
      ))}
      <label className="choice">
        <input type="checkbox" checked={flatten} onChange={(e) => setFlatten(e.target.checked)} /> Khoá nội dung sau khi
        điền (không cho sửa nữa)
      </label>
      <ErrorText>{error}</ErrorText>
      <div className="row-buttons">
        <button className="btn secondary" type="button" onClick={() => setFile(null)}>
          Chọn file khác
        </button>
        <button className="btn" type="button" disabled={busy} onClick={save}>
          {busy ? "Đang lưu..." : "Lưu PDF đã điền"}
        </button>
      </div>
    </div>
  );
}

// Ô nhập cho một ô biểu mẫu: hộp kiểm, danh sách chọn, ô chữ một dòng hoặc nhiều dòng.
function FieldInput({ field, id, onChange }) {
  if (field.kind === "check") {
    return (
      <label className="choice">
        <input type="checkbox" checked={field.value} onChange={(e) => onChange(e.target.checked)} /> {field.name}
      </label>
    );
  }
  const props = { id, className: "text-input", value: field.value, onChange: (e) => onChange(e.target.value) };
  return (
    <>
      <label className="option-label" htmlFor={id}>
        {field.name}
      </label>
      {field.kind === "select" ? (
        <select {...props}>
          <option value="">(chưa chọn)</option>
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : field.multiline ? (
        <textarea rows={3} {...props} />
      ) : (
        <input {...props} />
      )}
    </>
  );
}
