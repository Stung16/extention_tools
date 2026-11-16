import { useRef, useState } from "react";
import { extOf } from "../lib/utils";

export const MAX_UPLOAD_MB = 100;

// Ô "Chọn file / kéo thả file vào đây".
//   accept    danh sách đuôi file được nhận, ví dụ [".pdf"]
//   multiple  cho chọn nhiều file
//   onFiles   hàm nhận danh sách file hợp lệ
//   maxMB     dung lượng tối đa mỗi file (null = không giới hạn, dùng cho công cụ chạy trên trình duyệt)
export default function FileDrop({ accept, multiple = false, onFiles, maxMB = MAX_UPLOAD_MB, label, compact = false }) {
  const input = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");

  function take(fileList) {
    const files = [...fileList];
    if (!files.length) return;
    const bad = files.find((f) => accept && !accept.includes(extOf(f.name)));
    if (bad) return setError(`"${bad.name}" không đúng loại. Công cụ này nhận: ${accept.join(", ")}`);
    const big = maxMB && files.find((f) => f.size > maxMB * 1024 * 1024);
    if (big) return setError(`"${big.name}" quá lớn. Tối đa ${maxMB} MB mỗi file.`);
    setError("");
    onFiles(multiple ? files : [files[0]]);
  }

  return (
    <div>
      <label
        className={"drop" + (dragging ? " dragging" : "") + (compact ? " compact" : "")}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); take(e.dataTransfer.files); }}
      >
        <span className="btn">{label || (multiple ? "Chọn các file" : "Chọn file")}</span>
        <span className="hint">hoặc kéo thả file vào đây</span>
        {!compact && accept && (
          <span className="hint">Nhận file: {accept.join(", ")}{maxMB ? ` · Tối đa ${maxMB} MB` : ""}</span>
        )}
        <input
          ref={input}
          type="file"
          accept={accept?.join(",")}
          multiple={multiple}
          onChange={(e) => { take(e.target.files); e.target.value = ""; }}
        />
      </label>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
