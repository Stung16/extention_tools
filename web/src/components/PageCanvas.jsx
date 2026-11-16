import { useEffect, useRef } from "react";
import { renderPage } from "../lib/pdf";

// Vẽ một trang PDF (bằng pdf.js) vào khung. onRendered nhận { viewport, rotation } sau khi vẽ xong.
export default function PageCanvas({ doc, pageNumber, width, onRendered, className }) {
  const box = useRef(null);

  useEffect(() => {
    let cancelled = false;
    renderPage(doc, pageNumber, width).then(({ canvas, viewport, rotation }) => {
      if (cancelled || !box.current) return;
      box.current.replaceChildren(canvas);
      onRendered?.({ viewport, rotation });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, pageNumber, width]);

  return <div ref={box} className={className} style={{ minHeight: 40 }} />;
}
