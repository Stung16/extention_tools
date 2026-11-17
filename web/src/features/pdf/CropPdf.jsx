import { useRef, useState } from "react";
import ChoiceGroup from "@/shared/components/ChoiceGroup";
import { ErrorText } from "@/shared/components/Messages";
import PickFilePanel from "@/shared/components/PickFilePanel";
import useTask from "@/shared/hooks/useTask";
import { downloadBlob, stemOf } from "@/shared/lib/files";
import { capturePointer, pointIn, rectBetween } from "@/shared/lib/pointer";
import PageCanvas from "./components/PageCanvas";
import PagePager from "./components/PagePager";
import { cropPdf, MIN_CROP_PX, toFractions } from "./operations/crop";
import { openPdf } from "./pdfViewer";

const PREVIEW_WIDTH = 560;
const SCOPES = [
  { value: "all", label: "Mọi trang" },
  { value: "one", label: "Chỉ trang đang xem" },
];

// Cắt lề: kéo một khung trên trang để chọn phần giữ lại, áp dụng cho một trang hoặc mọi trang.
export default function CropPdf() {
  const [pdf, setPdf] = useState(null); // { file, bytes, doc }
  const [pageNumber, setPageNumber] = useState(1);
  const [view, setView] = useState(null); // { width, height } của trang trên màn hình
  const [box, setBox] = useState(null); // { x, y, w, h } theo điểm ảnh trên màn hình
  const [scope, setScope] = useState("all");
  const { busy, error, setError, run } = useTask();
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

  function down(e) {
    capturePointer(e.currentTarget, e.pointerId);
    start.current = pointIn(area.current, e, true);
    setBox({ ...start.current, w: 0, h: 0 });
  }
  function move(e) {
    if (start.current) setBox(rectBetween(start.current, pointIn(area.current, e, true)));
  }
  const up = () => {
    start.current = null;
  };

  function save() {
    if (!box || box.w < MIN_CROP_PX || box.h < MIN_CROP_PX)
      return setError("Hãy kéo một khung trên trang để chọn phần cần giữ lại.");
    return run(async () => {
      // Khung tính theo tỉ lệ của trang đang xem, rồi áp dụng cho từng trang theo kích thước của trang đó.
      const bytes = await cropPdf(pdf.bytes, toFractions(box, view), scope === "all" ? null : pageNumber);
      downloadBlob(bytes, `${stemOf(pdf.file.name)}-da-cat.pdf`, "application/pdf");
    });
  }

  if (!pdf) return <PickFilePanel onFiles={pick} error={error} />;

  return (
    <div className="panel wide">
      <p className="hint-line">Kéo chuột trên trang để vẽ khung phần muốn giữ lại.</p>
      <PagePager page={pageNumber} pageCount={pdf.doc.numPages} onPage={setPageNumber} />
      <div className="page-stage">
        <div ref={area} className="page-wrap crop-area" onPointerDown={down} onPointerMove={move} onPointerUp={up}>
          <PageCanvas
            doc={pdf.doc}
            pageNumber={pageNumber}
            width={PREVIEW_WIDTH}
            onRendered={({ viewport }) => setView({ width: viewport.width, height: viewport.height })}
          />
          {box && box.w > 0 && (
            <div className="crop-box" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} />
          )}
        </div>
      </div>
      <ChoiceGroup legend="Áp dụng cho" name="crop-scope" options={SCOPES} value={scope} onChange={setScope} />
      <ErrorText>{error}</ErrorText>
      <div className="row-buttons">
        <button className="btn secondary" type="button" onClick={() => setPdf(null)}>
          Chọn file khác
        </button>
        <button className="btn" type="button" disabled={busy} onClick={save}>
          {busy ? "Đang lưu..." : "Cắt và lưu PDF"}
        </button>
      </div>
    </div>
  );
}
