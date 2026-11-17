import { useState } from "react";
import { checkFiles, MAX_UPLOAD_MB } from "@/shared/lib/files";
import { ErrorText } from "./Messages";

// Ô "Chọn file / kéo thả file vào đây".
//   accept    danh sách đuôi file được nhận, ví dụ [".pdf"]
//   multiple  cho chọn nhiều file
//   onFiles   hàm nhận danh sách file hợp lệ
//   maxMB     dung lượng tối đa mỗi file (null = không giới hạn, dùng cho công cụ chạy trên trình duyệt)
//   compact   ô nhỏ gọn (khi đã có file, dùng làm nút "Thêm file")
export default function FileDrop({ accept, multiple = false, onFiles, maxMB = MAX_UPLOAD_MB, label, compact = false }) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");

  function take(fileList) {
    const files = [...fileList];
    if (!files.length) return;
    const problem = checkFiles(files, accept, maxMB);
    setError(problem);
    if (!problem) onFiles(multiple ? files : [files[0]]);
  }

  return (
    <div>
      <label
        className={"drop" + (dragging ? " dragging" : "") + (compact ? " compact" : "")}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          take(e.dataTransfer.files);
        }}
      >
        <span className="btn">{label || (multiple ? "Chọn các file" : "Chọn file")}</span>
        <span className="hint">hoặc kéo thả file vào đây</span>
        {!compact && accept && (
          <span className="hint">
            Nhận file: {accept.join(", ")}
            {maxMB ? ` · Tối đa ${maxMB} MB` : ""}
          </span>
        )}
        <input
          type="file"
          accept={accept?.join(",")}
          multiple={multiple}
          onChange={(e) => {
            take(e.target.files);
            e.target.value = ""; // chọn lại đúng file đó vẫn nhận
          }}
        />
      </label>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
