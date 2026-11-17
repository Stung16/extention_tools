import { loadForEdit } from "../pdfDocument";

export const MIN_CROP_PX = 10; // khung nhỏ hơn thế coi như chưa vẽ

// Khung người dùng kéo trên màn hình (điểm ảnh) -> tỉ lệ 0..1 của trang, để áp dụng cho trang có kích thước khác.
//   box   { x, y, w, h } tính từ góc trên-trái của trang đang xem
//   view  { width, height } kích thước trang đang xem trên màn hình
export function toFractions(box, view) {
  return { fx: box.x / view.width, fy: box.y / view.height, fw: box.w / view.width, fh: box.h / view.height };
}

// Khung cắt mới (toạ độ PDF) cho một trang có khung cắt hiện tại `current` ({ x, y, width, height }).
// Toạ độ PDF tính từ góc dưới-trái, còn màn hình tính từ góc trên-trái: phải đổi chiều trục dọc.
export function cropRect(current, { fx, fy, fw, fh }) {
  return {
    x: current.x + fx * current.width,
    y: current.y + (1 - fy - fh) * current.height,
    width: fw * current.width,
    height: fh * current.height,
  };
}

// Cắt lề: đặt khung cắt cho mọi trang (pageNumber = null) hoặc chỉ một trang.
export async function cropPdf(bytes, fractions, pageNumber = null) {
  const doc = await loadForEdit(bytes);
  const targets = pageNumber == null ? doc.getPages() : [doc.getPage(pageNumber - 1)];
  for (const page of targets) {
    const r = cropRect(page.getCropBox(), fractions);
    page.setCropBox(r.x, r.y, r.width, r.height);
  }
  return doc.save();
}
