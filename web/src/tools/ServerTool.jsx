import { useState } from "react";
import FileDrop from "../components/FileDrop";
import JobStatus from "../components/JobStatus";
import OptionField, { checkValues, defaultValues } from "../components/OptionField";
import useJob from "../components/useJob";
import { formatSize } from "../lib/utils";

// Công cụ xử lý trên máy chủ: chọn file (hoặc dán link, hoặc chỉ nhập chữ) -> tuỳ chọn -> gửi -> chờ -> tải kết quả.
// Dùng chung cho mọi công cụ có "job" trong catalog.js.
//   type.input: "file" (tải file lên), "url" (dán đường link), "none" (chỉ nhập chữ, ví dụ đọc văn bản)
export default function ServerTool({ tool, type, suggestions = [] }) {
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState("");
  const [values, setValues] = useState(() => defaultValues(type.options));
  const [error, setError] = useState("");
  const { state, start, reset } = useJob();
  const input = type.input || "file";

  function submit() {
    let problem = "";
    if (input === "url") {
      if (!url.trim()) problem = "Vui lòng dán đường link.";
      else if (type.urlPattern && !new RegExp(type.urlPattern).test(url.trim())) problem = "Đường link không hợp lệ cho công cụ này.";
    } else if (input === "file" && !file) {
      problem = "Vui lòng chọn file.";
    }
    problem ||= checkValues(type.options, values);
    if (problem) return setError(problem);
    setError("");

    const data = new FormData();
    data.append("type", tool.job);
    if (input === "url") data.append("url", url.trim());
    if (input === "file") data.append("file", file);
    for (const o of type.options || []) if (values[o.name] !== "") data.append(o.name, values[o.name]);
    start(data);
  }

  function again() {
    reset();
    setFile(null);
    setUrl("");
    // Xoá mật khẩu đã gõ, không để lại trên trang.
    setValues((v) => ({ ...v, ...Object.fromEntries((type.options || []).filter((o) => o.kind === "password").map((o) => [o.name, ""])) }));
  }

  if (state.phase !== "idle") {
    return (
      <div className="panel">
        <JobStatus state={state} onAgain={again} showSaving={tool.job === "compress-pdf"} suggestions={suggestions}
                   againLabel={input === "none" ? "Làm lại" : undefined} />
      </div>
    );
  }

  return (
    <div className="panel">
      {!type.online && (
        <p className="notice">
          Máy xử lý cho công cụ này đang tắt. Bạn vẫn gửi được; yêu cầu sẽ chờ và tự xử lý khi máy bật.
        </p>
      )}

      {input === "url" && (
        <div className="option first">
          <label className="option-label" htmlFor="url">Đường link *</label>
          <input id="url" className="text-input" type="url" value={url} placeholder="https://www.youtube.com/watch?v=..."
                 onChange={(e) => setUrl(e.target.value)} />
        </div>
      )}
      {input === "file" && !file && <FileDrop accept={type.extensions} onFiles={([f]) => setFile(f)} />}
      {input === "file" && file && (
        <div className="file-line">
          <span>{file.name}</span>
          <small>{formatSize(file.size)}</small>
          <button type="button" className="link" onClick={() => setFile(null)}>Đổi file</button>
        </div>
      )}

      {(type.options || []).map((o, i) => (
        <OptionField key={o.name} option={o} value={values[o.name]} first={input === "none" && i === 0}
                     onChange={(v) => setValues({ ...values, [o.name]: v })} />
      ))}

      {error && <p className="error-text">{error}</p>}
      <button className="btn" type="button" onClick={submit} disabled={input === "file" && !file}>{tool.name}</button>
    </div>
  );
}
