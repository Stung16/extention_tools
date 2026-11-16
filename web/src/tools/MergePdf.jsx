import { useState } from "react";
import { PDFDocument } from "pdf-lib";
import FileDrop from "../components/FileDrop";
import { loadForEdit } from "../lib/pdf";
import { downloadBlob, formatSize } from "../lib/utils";

// Gộp nhiều PDF thành một, chạy ngay trên trình duyệt bằng pdf-lib.
export default function MergePdf() {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  const add = (list) => { setFiles((old) => [...old, ...list]); setDone(null); };
  const move = (i, step) => setFiles((old) => {
    const next = [...old];
    [next[i], next[i + step]] = [next[i + step], next[i]];
    return next;
  });
  const remove = (i) => setFiles((old) => old.filter((_, k) => k !== i));

  async function merge() {
    setBusy(true);
    setError("");
    try {
      const out = await PDFDocument.create();
      for (const f of files) {
        let src;
        try {
          src = await loadForEdit(new Uint8Array(await f.arrayBuffer()));
        } catch (e) {
          throw new Error(`"${f.name}": ${e.message}`);
        }
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach((p) => out.addPage(p));
      }
      const bytes = await out.save();
      downloadBlob(bytes, "da-gop.pdf", "application/pdf");
      setDone({ pages: out.getPageCount(), size: bytes.length });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <FileDrop accept={[".pdf"]} multiple maxMB={null} onFiles={add} label={files.length ? "Thêm file" : "Chọn các file PDF"} compact={files.length > 0} />
      {files.length > 0 && (
        <ol className="file-list">
          {files.map((f, i) => (
            <li key={i + f.name}>
              <span className="name">{i + 1}. {f.name}</span>
              <small>{formatSize(f.size)}</small>
              <button type="button" className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} title="Lên trên">↑</button>
              <button type="button" className="icon-btn" disabled={i === files.length - 1} onClick={() => move(i, 1)} title="Xuống dưới">↓</button>
              <button type="button" className="icon-btn" onClick={() => remove(i)} title="Bỏ file này">✕</button>
            </li>
          ))}
        </ol>
      )}
      {error && <p className="error-text">{error}</p>}
      {done && <p className="ok-text">Đã gộp {done.pages} trang ({formatSize(done.size)}). File "da-gop.pdf" đã được tải về.</p>}
      <button className="btn" type="button" disabled={files.length < 2 || busy} onClick={merge}>
        {busy ? "Đang gộp..." : files.length < 2 ? "Chọn ít nhất 2 file" : `Gộp ${files.length} file`}
      </button>
    </div>
  );
}
