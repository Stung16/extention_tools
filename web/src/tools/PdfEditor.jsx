import { useEffect, useRef, useState } from "react";
import { degrees, LineCapStyle, rgb } from "pdf-lib";
import FileDrop from "../components/FileDrop";
import PageCanvas from "../components/PageCanvas";
import { embedVietFont, loadForEdit, openPdf } from "../lib/pdf";
import { capturePointer, downloadBlob, stemOf } from "../lib/utils";
import SignaturePad from "./SignaturePad";

// Trình sửa PDF chạy trên trình duyệt, dùng cho 3 công cụ: Sửa PDF, Ghi chú PDF, Ký PDF.
// Mọi thứ đặt lên trang được lưu theo toạ độ điểm ảnh trên màn hình; khi lưu file, đổi sang toạ độ PDF
// bằng viewport của pdf.js (đã tính sẵn lề cắt và trang bị xoay), rồi vẽ bằng pdf-lib.

const MODES = {
  select: { label: "Chọn / di chuyển", icon: "↖" },
  text: { label: "Thêm chữ", icon: "T" },
  draw: { label: "Bút vẽ", icon: "✎" },
  highlight: { label: "Tô sáng", icon: "▮" },
  whiteout: { label: "Che trắng", icon: "▭" },
  image: { label: "Chèn ảnh", icon: "🖼" },
  signature: { label: "Chữ ký", icon: "✍" },
};
const COLORS = ["#111111", "#1d3b8f", "#c0262d", "#0b7a3b"];
const HIGHLIGHT = "rgba(255, 221, 0, 0.42)";

export const EditPdf = (props) => <PdfEditor {...props} modes={["select", "text", "whiteout", "image", "draw", "highlight", "signature"]} initial="text" />;
export const AnnotatePdf = (props) => <PdfEditor {...props} modes={["select", "highlight", "text", "draw"]} initial="highlight" />;
export const SignPdf = (props) => <PdfEditor {...props} modes={["select", "signature", "text"]} initial="signature" />;

let nextId = 1;
const hexToRgb = (hex) => rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);

function PdfEditor({ modes, initial }) {
  const [pdf, setPdf] = useState(null);
  const [width, setWidth] = useState(720);
  const [pageNumber, setPageNumber] = useState(1);
  const [mode, setMode] = useState(initial);
  const [color, setColor] = useState(COLORS[0]);
  const [objects, setObjects] = useState({}); // { số trang: [vật thể...] }
  const [selected, setSelected] = useState(null);
  const [signing, setSigning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const viewports = useRef({}); // viewport pdf.js của từng trang đã vẽ (để đổi toạ độ khi lưu)
  const overlay = useRef(null);
  const action = useRef(null); // thao tác chuột đang làm: vẽ, kéo khung, di chuyển
  const imageInput = useRef(null);

  const pageObjects = objects[pageNumber] || [];
  const selectedObj = pageObjects.find((o) => o.id === selected);

  async function pick([file]) {
    setError("");
    try {
      const { bytes, doc } = await openPdf(file);
      viewports.current = {};
      setObjects({});
      setSelected(null);
      setPageNumber(1);
      setWidth(Math.min(720, window.innerWidth - 48));
      setPdf({ file, bytes, doc });
      if (initial === "signature") setSigning(true);
    } catch (e) {
      setError(e.message);
    }
  }

  const update = (id, patch) =>
    setObjects((all) => ({ ...all, [pageNumber]: (all[pageNumber] || []).map((o) => (o.id === id ? { ...o, ...patch } : o)) }));
  const add = (obj) => {
    setObjects((all) => ({ ...all, [pageNumber]: [...(all[pageNumber] || []), obj] }));
    setSelected(obj.id);
  };
  const removeSelected = () => {
    if (!selected) return;
    setObjects((all) => ({ ...all, [pageNumber]: (all[pageNumber] || []).filter((o) => o.id !== selected) }));
    setSelected(null);
  };

  // Phím Delete xoá vật thể đang chọn (trừ khi đang gõ chữ).
  useEffect(() => {
    const onKey = (e) => {
      if ((e.key === "Delete" || e.key === "Backspace") && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) removeSelected();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const pointOf = (e) => {
    const r = overlay.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function onPointerDown(e) {
    if (e.target.closest(".obj")) return; // bấm vào vật thể: để vật thể tự xử lý (di chuyển)
    const p = pointOf(e);
    setSelected(null);
    if (mode === "text") {
      add({ id: nextId++, type: "text", x: p.x, y: p.y - 12, text: "Nhập chữ ở ô bên dưới", size: 16, color });
    } else if (mode === "draw") {
      capturePointer(e.currentTarget, e.pointerId);
      const obj = { id: nextId++, type: "draw", points: [[p.x, p.y]], color, width: 2.5 };
      action.current = { kind: "draw", id: obj.id };
      setObjects((all) => ({ ...all, [pageNumber]: [...(all[pageNumber] || []), obj] }));
    } else if (mode === "highlight" || mode === "whiteout") {
      capturePointer(e.currentTarget, e.pointerId);
      const obj = { id: nextId++, type: mode, x: p.x, y: p.y, w: 0, h: 0 };
      action.current = { kind: "rect", id: obj.id, start: p };
      add(obj);
    } else if (mode === "image") {
      imageInput.current?.click();
    } else if (mode === "signature") {
      setSigning(true);
    }
  }

  function onPointerMove(e) {
    const a = action.current;
    if (!a) return;
    const p = pointOf(e);
    if (a.kind === "draw") {
      setObjects((all) => ({
        ...all,
        [pageNumber]: all[pageNumber].map((o) => (o.id === a.id ? { ...o, points: [...o.points, [p.x, p.y]] } : o)),
      }));
    } else if (a.kind === "rect") {
      update(a.id, { x: Math.min(a.start.x, p.x), y: Math.min(a.start.y, p.y), w: Math.abs(p.x - a.start.x), h: Math.abs(p.y - a.start.y) });
    } else if (a.kind === "move") {
      update(a.id, { x: a.ox + p.x - a.start.x, y: a.oy + p.y - a.start.y });
    } else if (a.kind === "resize") {
      const w = Math.max(16, a.ow + p.x - a.start.x);
      update(a.id, a.keepRatio ? { w, h: w * a.ratio } : { w, h: Math.max(8, a.oh + p.y - a.start.y) });
    }
  }

  function onPointerUp() {
    const a = action.current;
    action.current = null;
    // Khung quá nhỏ (bấm nhầm) thì bỏ.
    if (a?.kind === "rect") {
      const o = (objects[pageNumber] || []).find((x) => x.id === a.id);
      if (o && (o.w < 4 || o.h < 4)) {
        setObjects((all) => ({ ...all, [pageNumber]: all[pageNumber].filter((x) => x.id !== a.id) }));
        setSelected(null);
      }
    }
  }

  function startMove(e, obj) {
    e.stopPropagation();
    capturePointer(overlay.current, e.pointerId);
    setSelected(obj.id);
    const p = pointOf(e);
    action.current = { kind: "move", id: obj.id, start: p, ox: obj.x, oy: obj.y };
  }

  function startResize(e, obj) {
    e.stopPropagation();
    capturePointer(overlay.current, e.pointerId);
    action.current = { kind: "resize", id: obj.id, start: pointOf(e), ow: obj.w, oh: obj.h, keepRatio: obj.type === "image", ratio: obj.h / obj.w };
  }

  function placeImage(src, natW, natH, isSignature) {
    const vp = viewports.current[pageNumber];
    const w = Math.min(isSignature ? 200 : 260, natW);
    const h = (w * natH) / natW;
    add({ id: nextId++, type: "image", src, x: (vp.width - w) / 2, y: vp.height / 2 - h / 2, w, h });
    setMode("select");
  }

  function onImageFile(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) return setError("Chỉ chèn được ảnh PNG hoặc JPG.");
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => placeImage(reader.result, img.naturalWidth, img.naturalHeight, false);
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const doc = await loadForEdit(pdf.bytes);
      const needsFont = Object.values(objects).some((list) => list.some((o) => o.type === "text"));
      const font = needsFont ? await embedVietFont(doc) : null;
      const imageCache = new Map();

      for (const [num, list] of Object.entries(objects)) {
        if (!list.length) continue;
        const page = doc.getPage(Number(num) - 1);
        const vp = viewports.current[num];
        const toPdf = (x, y) => vp.convertToPdfPoint(x, y);
        const k = 1 / vp.scale; // điểm ảnh trên màn hình -> đơn vị PDF
        const rotate = degrees(page.getRotation().angle);

        for (const o of list) {
          if (o.type === "text") {
            o.text.split("\n").forEach((line, i) => {
              if (!line) return;
              const [x, y] = toPdf(o.x, o.y + o.size * 0.95 + i * o.size * 1.3);
              page.drawText(line, { x, y, size: o.size * k, font, color: hexToRgb(o.color), rotate });
            });
          } else if (o.type === "highlight" || o.type === "whiteout") {
            const [x1, y1] = toPdf(o.x, o.y);
            const [x2, y2] = toPdf(o.x + o.w, o.y + o.h);
            page.drawRectangle({
              x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1),
              color: o.type === "highlight" ? rgb(1, 0.87, 0) : rgb(1, 1, 1),
              opacity: o.type === "highlight" ? 0.42 : 1,
            });
          } else if (o.type === "draw") {
            for (let i = 1; i < o.points.length; i++) {
              const [sx, sy] = toPdf(...o.points[i - 1]);
              const [ex, ey] = toPdf(...o.points[i]);
              page.drawLine({ start: { x: sx, y: sy }, end: { x: ex, y: ey }, thickness: o.width * k, color: hexToRgb(o.color), lineCap: LineCapStyle.Round });
            }
          } else if (o.type === "image") {
            if (!imageCache.has(o.src)) {
              const bytes = await fetch(o.src).then((r) => r.arrayBuffer());
              imageCache.set(o.src, o.src.startsWith("data:image/png") ? await doc.embedPng(bytes) : await doc.embedJpg(bytes));
            }
            // Neo ảnh ở góc dưới-trái (theo hướng nhìn trên màn hình).
            const [x, y] = toPdf(o.x, o.y + o.h);
            page.drawImage(imageCache.get(o.src), { x, y, width: o.w * k, height: o.h * k, rotate });
          }
        }
      }
      downloadBlob(await doc.save(), `${stemOf(pdf.file.name)}-da-sua.pdf`, "application/pdf");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!pdf) return <div className="panel"><FileDrop accept={[".pdf"]} maxMB={null} onFiles={pick} />{error && <p className="error-text">{error}</p>}</div>;

  const count = Object.values(objects).reduce((n, list) => n + list.length, 0);

  return (
    <div className="panel wide editor">
      <div className="toolbar">
        {modes.map((m) => (
          <button key={m} type="button" className={"tool-btn" + (mode === m ? " active" : "")} onClick={() => { setMode(m); if (m === "signature") setSigning(true); if (m === "image") imageInput.current?.click(); }}>
            <span aria-hidden="true">{MODES[m].icon}</span> {MODES[m].label}
          </button>
        ))}
        {(modes.includes("text") || modes.includes("draw")) && (
          <span className="color-row">
            {COLORS.map((c) => (
              <button key={c} type="button" className={"swatch" + (color === c ? " active" : "")} style={{ background: c }}
                      onClick={() => { setColor(c); if (selectedObj && (selectedObj.type === "text" || selectedObj.type === "draw")) update(selectedObj.id, { color: c }); }} aria-label={"Màu " + c} />
            ))}
          </span>
        )}
      </div>
      <input ref={imageInput} type="file" accept="image/png,image/jpeg" hidden onChange={onImageFile} />

      {pdf.doc.numPages > 1 && (
        <div className="pager">
          <button type="button" className="icon-btn" disabled={pageNumber <= 1} onClick={() => { setSelected(null); setPageNumber(pageNumber - 1); }}>‹</button>
          <span>Trang {pageNumber}/{pdf.doc.numPages}</span>
          <button type="button" className="icon-btn" disabled={pageNumber >= pdf.doc.numPages} onClick={() => { setSelected(null); setPageNumber(pageNumber + 1); }}>›</button>
        </div>
      )}

      <div className="page-stage">
        <div className="page-wrap">
          <PageCanvas doc={pdf.doc} pageNumber={pageNumber} width={width}
                      onRendered={({ viewport }) => { viewports.current[pageNumber] = viewport; }} />
          <div ref={overlay} className={"overlay mode-" + mode}
               onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
            <svg className="ink">
              {pageObjects.filter((o) => o.type === "draw").map((o) => (
                <polyline key={o.id} points={o.points.map((p) => p.join(",")).join(" ")} fill="none" stroke={o.color}
                          strokeWidth={o.width} strokeLinecap="round" strokeLinejoin="round"
                          className={selected === o.id ? "sel" : ""} onPointerDown={(e) => { e.stopPropagation(); setSelected(o.id); }} />
              ))}
            </svg>
            {pageObjects.filter((o) => o.type !== "draw").map((o) => (
              <div key={o.id} className={"obj obj-" + o.type + (selected === o.id ? " selected" : "")}
                   style={{ left: o.x, top: o.y, ...(o.type === "text" ? { fontSize: o.size, color: o.color } : { width: o.w, height: o.h }), ...(o.type === "highlight" ? { background: HIGHLIGHT } : {}) }}
                   onPointerDown={(e) => startMove(e, o)}>
                {o.type === "text" && o.text}
                {o.type === "image" && <img src={o.src} alt="" draggable={false} />}
                {selected === o.id && o.type !== "text" && <span className="handle" onPointerDown={(e) => startResize(e, o)} />}
              </div>
            ))}
          </div>
        </div>
      </div>

      {selectedObj && (
        <div className="props">
          {selectedObj.type === "text" && (
            <>
              <label className="option-label" htmlFor="obj-text">Nội dung chữ</label>
              <textarea id="obj-text" className="text-input" rows={3} value={selectedObj.text} autoFocus
                        onFocus={(e) => e.target.select()} onChange={(e) => update(selectedObj.id, { text: e.target.value })} />
              <label className="inline">
                Cỡ chữ
                <input type="range" min="8" max="48" value={selectedObj.size} onChange={(e) => update(selectedObj.id, { size: Number(e.target.value) })} />
                {selectedObj.size}
              </label>
            </>
          )}
          <button type="button" className="link danger" onClick={removeSelected}>Xoá mục này</button>
        </div>
      )}

      {signing && (
        <SignaturePad onCancel={() => setSigning(false)}
                      onDone={(src, w, h) => { setSigning(false); placeImage(src, w, h, true); }} />
      )}

      {error && <p className="error-text">{error}</p>}
      <div className="row-buttons">
        <button className="btn secondary" type="button" onClick={() => setPdf(null)}>Chọn file khác</button>
        <button className="btn" type="button" disabled={busy || count === 0} onClick={save}>
          {busy ? "Đang lưu..." : count === 0 ? "Chưa có thay đổi" : `Lưu PDF (${count} thay đổi)`}
        </button>
      </div>
    </div>
  );
}
