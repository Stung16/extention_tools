import { lazy } from "react";

// Các công cụ chạy ngay trên trình duyệt (khoá "client" trong tools.js).
// lazy(): chỉ tải mã của công cụ khi người dùng mở trang đó, nên trang chủ vẫn nhẹ.
export const CLIENT_TOOLS = {
  merge: lazy(() => import("./MergePdf")),
  split: lazy(() => import("./SplitPdf")),
  organize: lazy(() => import("./OrganizePdf")),
  crop: lazy(() => import("./CropPdf")),
  edit: lazy(() => import("./PdfEditor").then((m) => ({ default: m.EditPdf }))),
  annotate: lazy(() => import("./PdfEditor").then((m) => ({ default: m.AnnotatePdf }))),
  sign: lazy(() => import("./PdfEditor").then((m) => ({ default: m.SignPdf }))),
  fill: lazy(() => import("./FillPdf")),
  qr: lazy(() => import("./QrCode")),
  mergeImages: lazy(() => import("./MergeImages")),
  trimVideo: lazy(() => import("./TrimVideo")),
};
