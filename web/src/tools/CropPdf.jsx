import { useRef, useState } from "react";
import FileDrop from "../components/FileDrop";
import PageCanvas from "../components/PageCanvas";
import { loadForEdit, openPdf } from "../lib/pdf";
import { capturePointer, downloadBlob, stemOf } from "../lib/utils";

const PREVIEW_WIDTH = 560;

// Cắt lề: kéo một khung trên trang để chọn phần giữ lại, áp dụng cho một trang hoặc mọi trang.
export default function CropPdf() {
  const [pdf, setPdf] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [view, setView] = useState(null); // { width, height } của trang trên màn hình
  const [box, setBox] = useState(null); // { x, y, w, h } theo điểm ảnh trên màn hình
  const [scope, setScope] = useState("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const start = useRef(null);
  const area = useRef(null);

  async function pick([file]) {
    setError("");
    try {
      const { bytes, doc } = await openPdf(file);
      setPdf({ file, bytes, doc });
      setPageNumber(1);
      setBox(null);
    } catch (e) {
      setError(e.message);
    }
  }

  const pos = (e) => {
    const r = area.current.getBoundingClientRect();
    return { x: Math.min(Math.max(e.clientX - r.left, 0), r.width), y: Math.min(Math.max(e.clientY - r.top, 0), r.height) };
  };
  function down(e) {
    capturePointer(e.currentTarget, e.pointerId);
    start.current = pos(e);
    setBox({ ...start.current, w: 0, h: 0 });
  }
  function move(e) {
    if (!start.current) return;
    const p = pos(e);
    const s = start.current;
    setBox({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
  }
  const up = () => { start.current = null; };

  async function save() {
    if (!box || box.w < 10 || box.h < 10) return setError("Hãy kéo một khung trên trang để chọn phần cần giữ lại.");
    setBusy(true);
    setError("");
    try {
      const doc = await loadForEdit(pdf.bytes);
      // Khung tính theo tỉ lệ (0..1) của trang đang xem, rồi áp dụng cho từng trang theo kích thước của trang đó.
      const fx = box.x / view.width, fy = box.y / view.height, fw = box.w / view.width, fh = box.h / view.height;
      const targets = scope === "all" ? doc.getPages() : [doc.getPage(pageNumber - 1)];
      for (const page of targets) {
        const c = page.getCropBox();
        // Toạ độ PDF tính từ góc dưới-trái, còn màn hình tính từ góc trên-trái: đổi chiều trục dọc.
        page.setCropBox(c.x + fx * c.width, c.y + (1 - fy - fh) * c.height, fw * c.width, fh * c.height);
      }
      downloadBlob(await doc.save(), `${stemOf(pdf.file.name)}-da-cat.pdf`, "application/pdf");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!pdf) return <div className="panel"><FileDrop accept={[".pdf"]} maxMB={null} onFiles={pick} />{error && <p className="error-text">{error}</p>}</div>;

  return (
    <div className="panel wide">
      <p className="hint-line">Kéo chuột trên trang để vẽ khung phần muốn giữ lại.</p>
      {pdf.doc.numPages > 1 && (
        <div className="pager">
          <button type="button" className="icon-btn" disabled={pageNumber <= 1} onClick={() => { setPageNumber(pageNumber - 1); }}>‹</button>
          <span>Trang {pageNumber}/{pdf.doc.numPages}</span>
          <button type="button" className="icon-btn" disabled={pageNumber >= pdf.doc.numPages} onClick={() => { setPageNumber(pageNumber + 1); }}>›</button>
        </div>
      )}
      <div className="page-stage">
        <div ref={area} className="page-wrap crop-area" onPointerDown={down} onPointerMove={move} onPointerUp={up}>
          <PageCanvas doc={pdf.doc} pageNumber={pageNumber} width={PREVIEW_WIDTH}
                      onRendered={({ viewport }) => setView({ width: viewport.width, height: viewport.height })} />
          {box && box.w > 0 && (
            <div className="crop-box" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} />
          )}
        </div>
      </div>
      <fieldset className="option">
        <legend>Áp dụng cho</legend>
        <div className="choices">
          <label className={"choice" + (scope === "all" ? " checked" : "")}><input type="radio" checked={scope === "all"} onChange={() => setScope("all")} /> Mọi trang</label>
          <label className={"choice" + (scope === "one" ? " checked" : "")}><input type="radio" checked={scope === "one"} onChange={() => setScope("one")} /> Chỉ trang đang xem</label>
        </div>
      </fieldset>
      {error && <p className="error-text">{error}</p>}
      <div className="row-buttons">
        <button className="btn secondary" type="button" onClick={() => setPdf(null)}>Chọn file khác</button>
        <button className="btn" type="button" disabled={busy} onClick={save}>{busy ? "Đang lưu..." : "Cắt và lưu PDF"}</button>
      </div>
    </div>
  );
}
