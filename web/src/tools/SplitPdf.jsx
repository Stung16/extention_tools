import { useState } from "react";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import FileDrop from "../components/FileDrop";
import { loadForEdit } from "../lib/pdf";
import { downloadBlob, formatSize, stemOf } from "../lib/utils";

// Tách PDF ngay trên trình duyệt: mỗi trang một file, hoặc theo các khoảng trang. Nhiều file thì gói .zip.
export default function SplitPdf() {
  const [file, setFile] = useState(null);
  const [pageCount, setPageCount] = useState(0);
  const [mode, setMode] = useState("each");
  const [ranges, setRanges] = useState("");
  const [every, setEvery] = useState("2");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function pick([f]) {
    setError("");
    setDone("");
    try {
      const doc = await loadForEdit(new Uint8Array(await f.arrayBuffer()));
      setFile(f);
      setPageCount(doc.getPageCount());
    } catch (e) {
      setError(e.message);
    }
  }

  // Danh sách các nhóm trang (số trang bắt đầu từ 1), mỗi nhóm thành một file.
  function groups() {
    if (mode === "each") return Array.from({ length: pageCount }, (_, i) => [i + 1]);
    if (mode === "every") {
      const n = Number(every);
      if (!Number.isInteger(n) || n < 1) throw new Error("Số trang mỗi file phải là số nguyên từ 1 trở lên.");
      const out = [];
      for (let p = 1; p <= pageCount; p += n) out.push(Array.from({ length: Math.min(n, pageCount - p + 1) }, (_, k) => p + k));
      return out;
    }
    // Theo khoảng: "1-3, 4-6, 8" -> 3 file
    const parts = ranges.split(",").map((s) => s.trim()).filter(Boolean);
    if (!parts.length) throw new Error("Hãy nhập các khoảng trang, ví dụ: 1-3, 4-6, 8");
    return parts.map((part) => {
      const m = part.match(/^(\d+)\s*(?:-\s*(\d+))?$/);
      if (!m) throw new Error(`"${part}" không đúng dạng. Ví dụ đúng: 1-3, 4-6, 8`);
      const from = Number(m[1]);
      const to = m[2] ? Number(m[2]) : from;
      if (from < 1 || to > pageCount || to < from) throw new Error(`Khoảng "${part}" không hợp lệ (file có ${pageCount} trang).`);
      return Array.from({ length: to - from + 1 }, (_, k) => from + k);
    });
  }

  async function split() {
    setBusy(true);
    setError("");
    try {
      const list = groups();
      const src = await loadForEdit(new Uint8Array(await file.arrayBuffer()));
      const base = stemOf(file.name);
      const outputs = [];
      for (const pages of list) {
        const out = await PDFDocument.create();
        const copied = await out.copyPages(src, pages.map((p) => p - 1));
        copied.forEach((p) => out.addPage(p));
        const label = pages.length === 1 ? `trang-${pages[0]}` : `trang-${pages[0]}-${pages[pages.length - 1]}`;
        outputs.push({ name: `${base}-${label}.pdf`, bytes: await out.save() });
      }
      if (outputs.length === 1) {
        downloadBlob(outputs[0].bytes, outputs[0].name, "application/pdf");
      } else {
        const zip = new JSZip();
        outputs.forEach((o) => zip.file(o.name, o.bytes));
        const blob = await zip.generateAsync({ type: "blob" });
        downloadBlob(blob, `${base}-da-tach.zip`);
      }
      setDone(`Đã tách thành ${outputs.length} file${outputs.length > 1 ? " (gói trong file .zip)" : ""}.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!file) return <div className="panel"><FileDrop accept={[".pdf"]} maxMB={null} onFiles={pick} />{error && <p className="error-text">{error}</p>}</div>;

  return (
    <div className="panel">
      <div className="file-line">
        <span>{file.name}</span>
        <small>{pageCount} trang · {formatSize(file.size)}</small>
        <button type="button" className="link" onClick={() => setFile(null)}>Đổi file</button>
      </div>
      <fieldset className="option">
        <legend>Cách tách</legend>
        <div className="choices">
          {[["each", "Mỗi trang một file"], ["every", "Cứ mỗi N trang một file"], ["ranges", "Theo khoảng trang tự chọn"]].map(([v, label]) => (
            <label key={v} className={"choice" + (mode === v ? " checked" : "")}>
              <input type="radio" checked={mode === v} onChange={() => setMode(v)} /> {label}
            </label>
          ))}
        </div>
      </fieldset>
      {mode === "every" && (
        <div className="option">
          <label className="option-label" htmlFor="every">Số trang mỗi file</label>
          <input id="every" className="text-input" type="number" min="1" value={every} onChange={(e) => setEvery(e.target.value)} />
        </div>
      )}
      {mode === "ranges" && (
        <div className="option">
          <label className="option-label" htmlFor="ranges">Các khoảng trang (mỗi khoảng một file)</label>
          <input id="ranges" className="text-input" value={ranges} placeholder="Ví dụ: 1-3, 4-6, 8" onChange={(e) => setRanges(e.target.value)} />
        </div>
      )}
      {error && <p className="error-text">{error}</p>}
      {done && <p className="ok-text">{done}</p>}
      <button className="btn" type="button" disabled={busy} onClick={split}>{busy ? "Đang tách..." : "Tách PDF"}</button>
    </div>
  );
}
