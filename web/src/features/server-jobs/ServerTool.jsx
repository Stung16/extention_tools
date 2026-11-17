import { useState } from "react";
import FileDrop from "@/shared/components/FileDrop";
import FileLine from "@/shared/components/FileLine";
import { ErrorText } from "@/shared/components/Messages";
import { formatSize } from "@/shared/lib/format";
import { buildJobForm, checkRequest, defaultValues, withoutPasswords } from "./jobRequest";
import JobStatus from "./JobStatus";
import OptionField from "./OptionField";
import useJob from "./useJob";

// Công cụ xử lý trên máy chủ: chọn file (hoặc dán link, hoặc chỉ nhập chữ) -> tuỳ chọn -> gửi -> chờ -> tải kết quả.
// Dùng chung cho mọi công cụ có "job" trong catalog/categories.js.
//   type.input: "file" (tải file lên), "url" (dán đường link), "none" (chỉ nhập chữ, ví dụ đọc văn bản)
export default function ServerTool({ tool, type, suggestions = [] }) {
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState("");
  const [values, setValues] = useState(() => defaultValues(type.options));
  const [error, setError] = useState("");
  const { state, start, reset } = useJob();
  const input = type.input || "file";

  function submit() {
    const problem = checkRequest(type, { file, url }, values);
    setError(problem);
    if (!problem) start(buildJobForm(tool.job, type, { file, url }, values));
  }

  function again() {
    reset();
    setFile(null);
    setUrl("");
    setValues((v) => withoutPasswords(type.options, v));
  }

  if (state.phase !== "idle") {
    return (
      <div className="panel">
        <JobStatus
          state={state}
          onAgain={again}
          showSaving={tool.job === "compress-pdf"}
          suggestions={suggestions}
          againLabel={input === "none" ? "Làm lại" : undefined}
        />
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
          <label className="option-label" htmlFor="url">
            Đường link *
          </label>
          <input
            id="url"
            className="text-input"
            type="url"
            value={url}
            placeholder="https://www.youtube.com/watch?v=..."
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
      )}
      {input === "file" && !file && <FileDrop accept={type.extensions} onFiles={([f]) => setFile(f)} />}
      {input === "file" && file && (
        <FileLine name={file.name} detail={formatSize(file.size)} onChange={() => setFile(null)} />
      )}

      {(type.options || []).map((o, i) => (
        <OptionField
          key={o.name}
          option={o}
          value={values[o.name]}
          first={input === "none" && i === 0}
          onChange={(v) => setValues({ ...values, [o.name]: v })}
        />
      ))}

      <ErrorText>{error}</ErrorText>
      <button className="btn" type="button" onClick={submit} disabled={input === "file" && !file}>
        {tool.name}
      </button>
    </div>
  );
}
