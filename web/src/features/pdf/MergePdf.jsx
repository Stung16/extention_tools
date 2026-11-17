import { useState } from "react";
import FileDrop from "@/shared/components/FileDrop";
import { ErrorText, OkText } from "@/shared/components/Messages";
import useTask from "@/shared/hooks/useTask";
import { downloadBlob, readBytes } from "@/shared/lib/files";
import { formatSize } from "@/shared/lib/format";
import { mergePdfs } from "./operations/merge";

const OUTPUT_NAME = "da-gop.pdf";

// Gộp nhiều PDF thành một, chạy ngay trên trình duyệt (file không gửi lên máy chủ).
export default function MergePdf() {
  const [files, setFiles] = useState([]);
  const [done, setDone] = useState(null);
  const { busy, error, run } = useTask();

  const add = (list) => {
    setFiles((old) => [...old, ...list]);
    setDone(null);
  };
  const move = (i, step) =>
    setFiles((old) => {
      const next = [...old];
      [next[i], next[i + step]] = [next[i + step], next[i]];
      return next;
    });
  const remove = (i) => setFiles((old) => old.filter((_, k) => k !== i));

  const merge = () =>
    run(async () => {
      const sources = await Promise.all(files.map(async (f) => ({ name: f.name, bytes: await readBytes(f) })));
      const { bytes, pageCount } = await mergePdfs(sources);
      downloadBlob(bytes, OUTPUT_NAME, "application/pdf");
      setDone({ pages: pageCount, size: bytes.length });
    });

  return (
    <div className="panel">
      <FileDrop
        accept={[".pdf"]}
        multiple
        maxMB={null}
        onFiles={add}
        label={files.length ? "Thêm file" : "Chọn các file PDF"}
        compact={files.length > 0}
      />
      {files.length > 0 && (
        <ol className="file-list">
          {files.map((f, i) => (
            <li key={i + f.name}>
              <span className="name">
                {i + 1}. {f.name}
              </span>
              <small>{formatSize(f.size)}</small>
              <button
                type="button"
                className="icon-btn"
                disabled={i === 0}
                onClick={() => move(i, -1)}
                title="Lên trên"
              >
                ↑
              </button>
              <button
                type="button"
                className="icon-btn"
                disabled={i === files.length - 1}
                onClick={() => move(i, 1)}
                title="Xuống dưới"
              >
                ↓
              </button>
              <button type="button" className="icon-btn" onClick={() => remove(i)} title="Bỏ file này">
                ✕
              </button>
            </li>
          ))}
        </ol>
      )}
      <ErrorText>{error}</ErrorText>
      <OkText>
        {done && `Đã gộp ${done.pages} trang (${formatSize(done.size)}). File "${OUTPUT_NAME}" đã được tải về.`}
      </OkText>
      <button className="btn" type="button" disabled={files.length < 2 || busy} onClick={merge}>
        {busy ? "Đang gộp..." : files.length < 2 ? "Chọn ít nhất 2 file" : `Gộp ${files.length} file`}
      </button>
    </div>
  );
}
