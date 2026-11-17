import { useEffect, useRef, useState } from "react";
import { ErrorText } from "@/shared/components/Messages";
import PickFilePanel from "@/shared/components/PickFilePanel";
import useTask from "@/shared/hooks/useTask";
import { downloadBlob, stemOf } from "@/shared/lib/files";
import { capturePointer, pointIn, rectBetween } from "@/shared/lib/pointer";
import PageCanvas from "../components/PageCanvas";
import PagePager from "../components/PagePager";
import { loadVietFont } from "../pdfDocument";
import { openPdf } from "../pdfViewer";
import EditorToolbar from "./EditorToolbar";
import { EDITOR_PRESETS, HIGHLIGHT, INK_COLORS } from "./editorModes";
import { addObject, centeredImage, countObjects, isTinyRect, newId, removeObject, updateObject } from "./pageObjects";
import SelectedPanel from "./SelectedPanel";
import SignaturePad from "./SignaturePad";
import { writeAnnotations } from "./writeAnnotations";

// Trình sửa PDF chạy trên trình duyệt, dùng cho 3 công cụ: Sửa PDF, Ghi chú PDF, Ký PDF (khác nhau ở bộ nút).
// Luồng: chọn file -> pdf.js vẽ trang -> người dùng đặt chữ/nét vẽ/ảnh lên một lớp phủ trong suốt
// -> bấm Lưu: writeAnnotations vẽ chúng vào PDF bằng pdf-lib.
export const EditPdf = () => <PdfEditor preset={EDITOR_PRESETS.edit} />;
export const AnnotatePdf = () => <PdfEditor preset={EDITOR_PRESETS.annotate} />;
export const SignPdf = () => <PdfEditor preset={EDITOR_PRESETS.sign} />;

const MAX_PAGE_WIDTH = 720;

function PdfEditor({ preset }) {
  const [pdf, setPdf] = useState(null); // { file, bytes, doc }
  const [width, setWidth] = useState(MAX_PAGE_WIDTH);
  const [pageNumber, setPageNumber] = useState(1);
  const [mode, setMode] = useState(preset.initial);
  const [color, setColor] = useState(INK_COLORS[0]);
  const [objects, setObjects] = useState({}); // { số trang: [vật thể...] }, xem pageObjects.js
  const [selected, setSelected] = useState(null);
  const [signing, setSigning] = useState(false);
  const { busy, error, setError, run } = useTask();
  const viewports = useRef({}); // viewport pdf.js của từng trang đã vẽ (để đổi toạ độ khi lưu)
  const overlay = useRef(null);
  const action = useRef(null); // thao tác chuột đang làm: vẽ, kéo khung, di chuyển, đổi cỡ
  const imageInput = useRef(null);

  const pageObjects = objects[pageNumber] || [];
  const selectedObj = pageObjects.find((o) => o.id === selected);

  // Sửa vật thể trên trang đang xem.
  const add = (obj) => {
    setObjects((all) => addObject(all, pageNumber, obj));
    setSelected(obj.id);
  };
  const update = (id, patch) => setObjects((all) => updateObject(all, pageNumber, id, patch));
  const removeSelected = () => {
    if (!selected) return;
    setObjects((all) => removeObject(all, pageNumber, selected));
    setSelected(null);
  };

  // Phím Delete / Backspace xoá vật thể đang chọn (trừ khi đang gõ chữ).
  useEffect(() => {
    const onKey = (e) => {
      const typing = ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName);
      if ((e.key === "Delete" || e.key === "Backspace") && !typing) removeSelected();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function pick([file]) {
    setError("");
    try {
      const { bytes, doc } = await openPdf(file);
      viewports.current = {};
      setObjects({});
      setSelected(null);
      setPageNumber(1);
      setWidth(Math.min(MAX_PAGE_WIDTH, window.innerWidth - 48)); // vừa màn hình điện thoại
      setPdf({ file, bytes, doc });
      if (preset.initial === "signature") setSigning(true);
    } catch (e) {
      setError(e.message);
    }
  }

  const pointOf = (e) => pointIn(overlay.current, e);

  function chooseMode(m) {
    setMode(m);
    if (m === "signature") setSigning(true);
    if (m === "image") imageInput.current?.click();
  }

  function chooseColor(c) {
    setColor(c);
    if (selectedObj && (selectedObj.type === "text" || selectedObj.type === "draw"))
      update(selectedObj.id, { color: c });
  }

  // ---------- Chuột / ngón tay trên lớp phủ ----------

  function onPointerDown(e) {
    if (e.target.closest(".obj")) return; // bấm vào vật thể: để vật thể tự xử lý (di chuyển)
    const p = pointOf(e);
    setSelected(null);
    if (mode === "text") {
      e.preventDefault(); // giữ con trỏ ở ô nội dung vừa mở (không để trình duyệt chuyển focus sang trang)
      add({ id: newId(), type: "text", x: p.x, y: p.y - 12, text: "Nhập chữ ở ô bên dưới", size: 16, color });
    } else if (mode === "draw") {
      capturePointer(e.currentTarget, e.pointerId);
      const obj = { id: newId(), type: "draw", points: [[p.x, p.y]], color, width: 2.5 };
      action.current = { kind: "draw", id: obj.id };
      setObjects((all) => addObject(all, pageNumber, obj));
    } else if (mode === "highlight" || mode === "whiteout") {
      capturePointer(e.currentTarget, e.pointerId);
      const obj = { id: newId(), type: mode, x: p.x, y: p.y, w: 0, h: 0 };
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
      // Dạng hàm: nhiều sự kiện tới dồn trước khi React vẽ lại vẫn không mất điểm nào.
      update(a.id, (stroke) => ({ points: [...stroke.points, [p.x, p.y]] }));
    } else if (a.kind === "rect") {
      update(a.id, rectBetween(a.start, p));
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
    if (a?.kind !== "rect") return;
    const o = (objects[pageNumber] || []).find((x) => x.id === a.id);
    if (o && isTinyRect(o)) {
      setObjects((all) => removeObject(all, pageNumber, a.id));
      setSelected(null);
    }
  }

  function startMove(e, obj) {
    e.stopPropagation();
    capturePointer(overlay.current, e.pointerId);
    setSelected(obj.id);
    action.current = { kind: "move", id: obj.id, start: pointOf(e), ox: obj.x, oy: obj.y };
  }

  function startResize(e, obj) {
    e.stopPropagation();
    capturePointer(overlay.current, e.pointerId);
    action.current = {
      kind: "resize",
      id: obj.id,
      start: pointOf(e),
      ow: obj.w,
      oh: obj.h,
      keepRatio: obj.type === "image", // ảnh giữ đúng tỉ lệ
      ratio: obj.h / obj.w,
    };
  }

  // ---------- Ảnh, chữ ký ----------

  function placeImage(src, natW, natH, isSignature) {
    add(centeredImage(src, natW, natH, viewports.current[pageNumber], isSignature ? 200 : 260));
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

  const save = () =>
    run(async () => {
      const bytes = await writeAnnotations(pdf.bytes, objects, viewports.current, { loadFont: loadVietFont });
      downloadBlob(bytes, `${stemOf(pdf.file.name)}-da-sua.pdf`, "application/pdf");
    });

  if (!pdf) return <PickFilePanel onFiles={pick} error={error} />;

  const count = countObjects(objects);
  const goTo = (n) => {
    setSelected(null);
    setPageNumber(n);
  };

  return (
    <div className="panel wide editor">
      <EditorToolbar modes={preset.modes} mode={mode} onMode={chooseMode} color={color} onColor={chooseColor} />
      <input ref={imageInput} type="file" accept="image/png,image/jpeg" hidden onChange={onImageFile} />

      <PagePager page={pageNumber} pageCount={pdf.doc.numPages} onPage={goTo} />

      <div className="page-stage">
        <div className="page-wrap">
          <PageCanvas
            doc={pdf.doc}
            pageNumber={pageNumber}
            width={width}
            onRendered={({ viewport }) => {
              viewports.current[pageNumber] = viewport;
            }}
          />
          <div
            ref={overlay}
            className={"overlay mode-" + mode}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <svg className="ink">
              {pageObjects
                .filter((o) => o.type === "draw")
                .map((o) => (
                  <polyline
                    key={o.id}
                    points={o.points.map((p) => p.join(",")).join(" ")}
                    fill="none"
                    stroke={o.color}
                    strokeWidth={o.width}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={selected === o.id ? "sel" : ""}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setSelected(o.id);
                    }}
                  />
                ))}
            </svg>
            {pageObjects
              .filter((o) => o.type !== "draw")
              .map((o) => (
                <div
                  key={o.id}
                  className={"obj obj-" + o.type + (selected === o.id ? " selected" : "")}
                  style={objectStyle(o)}
                  onPointerDown={(e) => startMove(e, o)}
                >
                  {o.type === "text" && o.text}
                  {o.type === "image" && <img src={o.src} alt="" draggable={false} />}
                  {selected === o.id && o.type !== "text" && (
                    <span className="handle" onPointerDown={(e) => startResize(e, o)} />
                  )}
                </div>
              ))}
          </div>
        </div>
      </div>

      {selectedObj && (
        <SelectedPanel
          object={selectedObj}
          onChange={(patch) => update(selectedObj.id, patch)}
          onRemove={removeSelected}
        />
      )}

      {signing && (
        <SignaturePad
          onCancel={() => setSigning(false)}
          onDone={(src, w, h) => {
            setSigning(false);
            placeImage(src, w, h, true);
          }}
        />
      )}

      <ErrorText>{error}</ErrorText>
      <div className="row-buttons">
        <button className="btn secondary" type="button" onClick={() => setPdf(null)}>
          Chọn file khác
        </button>
        <button className="btn" type="button" disabled={busy || count === 0} onClick={save}>
          {busy ? "Đang lưu..." : count === 0 ? "Chưa có thay đổi" : `Lưu PDF (${count} thay đổi)`}
        </button>
      </div>
    </div>
  );
}

// Vị trí, cỡ, màu của vật thể trên lớp phủ.
function objectStyle(o) {
  const size = o.type === "text" ? { fontSize: o.size, color: o.color } : { width: o.w, height: o.h };
  return { left: o.x, top: o.y, ...size, ...(o.type === "highlight" ? { background: HIGHLIGHT.css } : {}) };
}
