import { lazy } from "react";

// Các công cụ chạy ngay trên trình duyệt: khoá ở đây = trường "client" trong catalog/categories.js.
// lazy(): chỉ tải mã của công cụ khi người dùng mở trang đó, nên trang chủ vẫn nhẹ.
const editor = () => import("@/features/pdf/editor/PdfEditor");

export const CLIENT_TOOLS = {
  merge: lazy(() => import("@/features/pdf/MergePdf")),
  split: lazy(() => import("@/features/pdf/SplitPdf")),
  organize: lazy(() => import("@/features/pdf/OrganizePdf")),
  crop: lazy(() => import("@/features/pdf/CropPdf")),
  edit: lazy(() => editor().then((m) => ({ default: m.EditPdf }))),
  annotate: lazy(() => editor().then((m) => ({ default: m.AnnotatePdf }))),
  sign: lazy(() => editor().then((m) => ({ default: m.SignPdf }))),
  fill: lazy(() => import("@/features/pdf/FillPdf")),
  qr: lazy(() => import("@/features/image/QrCode")),
  mergeImages: lazy(() => import("@/features/image/MergeImages")),
  trimVideo: lazy(() => import("@/features/video/TrimVideo")),
};
