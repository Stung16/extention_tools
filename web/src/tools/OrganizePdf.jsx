import { useState } from "react";
import { degrees, PDFDocument } from "pdf-lib";
import FileDrop from "../components/FileDrop";
import PageCanvas from "../components/PageCanvas";
import { loadForEdit, openPdf } from "../lib/pdf";
import { downloadBlob, stemOf } from "../lib/utils";

// Sắp xếp trang: kéo thả đổi thứ tự, xoay, xoá từng trang; lưu thành PDF mới (chạy trên trình duyệt).
export default function OrganizePdf() {
  const [pdf, setPdf] = useState(null); // { file, bytes, doc }
  const [pages, setPages] = useState([]); // [{ n: số trang gốc, rotate: độ xoay thêm }]
  const [dragIndex, setDragIndex] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function pick([file]) {
    setError("");
    try {
      const { bytes, doc } = await openPdf(file);
      setPdf({ file, bytes, doc });
      setPages(Array.from({ length: doc.numPages }, (_, i) => ({ n: i + 1, rotate: 0 })));
    } catch (e) {
      setError(e.message);
    }
  }

  function drop(target) {
    if (dragIndex === null || dragIndex === target) return;
    setPages((old) => {
      const next = [...old];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(target, 0, moved);
      return next;
    });
    setDragIndex(null);
  }

  const rotate = (i) => setPages((old) => old.map((p, k) => (k === i ? { ...p, rotate: (p.rotate + 90) % 360 } : p)));
  const remove = (i) => setPages((old) => old.filter((_, k) => k !== i));

  async function save() {
    setBusy(true);
    setError("");
    try {
      const src = await loadForEdit(pdf.bytes);
      const out = await PDFDocument.create();
      const copied = await out.copyPages(src, pages.map((p) => p.n - 1));
      copied.forEach((page, i) => {
        page.setRotation(degrees((page.getRotation().angle + pages[i].rotate) % 360));
        out.addPage(page);
      });
      downloadBlob(await out.save(), `${stemOf(pdf.file.name)}-da-sap-xep.pdf`, "application/pdf");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!pdf) return <div className="panel"><FileDrop accept={[".pdf"]} maxMB={null} onFiles={pick} />{error && <p className="error-text">{error}</p>}</div>;

  return (
    <div className="panel wide">
      <p className="hint-line">Kéo thả trang để đổi thứ tự. Bấm ⟳ để xoay, ✕ để xoá trang. Đang có {pages.length} trang.</p>
      <div className="thumbs">
        {pages.map((p, i) => (
          <div
            key={p.n}
            className={"thumb" + (dragIndex === i ? " dragging" : "")}
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => drop(i)}
            onDragEnd={() => setDragIndex(null)}
          >
            <div className="thumb-page" style={{ transform: `rotate(${p.rotate}deg)` }}>
              <PageCanvas doc={pdf.doc} pageNumber={p.n} width={130} />
            </div>
            <div className="thumb-bar">
              <span>Trang {p.n}</span>
              <button type="button" className="icon-btn" onClick={() => rotate(i)} title="Xoay 90°">⟳</button>
              <button type="button" className="icon-btn" onClick={() => remove(i)} disabled={pages.length === 1} title="Xoá trang">✕</button>
            </div>
          </div>
        ))}
      </div>
      {error && <p className="error-text">{error}</p>}
      <div className="row-buttons">
        <button className="btn secondary" type="button" onClick={() => setPdf(null)}>Chọn file khác</button>
        <button className="btn" type="button" disabled={busy || !pages.length} onClick={save}>{busy ? "Đang lưu..." : "Lưu PDF"}</button>
      </div>
    </div>
  );
}
