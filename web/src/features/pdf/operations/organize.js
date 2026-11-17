import { degrees, PDFDocument } from "pdf-lib";
import { loadForEdit } from "../pdfDocument";

// Tạo PDF mới theo thứ tự trang người dùng xếp lại.
//   pages  [{ n: số trang gốc (từ 1), rotate: độ xoay thêm (0, 90, 180, 270) }]; trang không có trong danh sách bị bỏ.
export async function organizePages(bytes, pages) {
  const src = await loadForEdit(bytes);
  const out = await PDFDocument.create();
  const copied = await out.copyPages(
    src,
    pages.map((p) => p.n - 1),
  );
  copied.forEach((page, i) => {
    page.setRotation(degrees((page.getRotation().angle + pages[i].rotate) % 360));
    out.addPage(page);
  });
  return out.save();
}
