// Đọc và vẽ trang PDF ra màn hình bằng pdf.js (của Mozilla). Chỉ chạy trên trình duyệt (cần canvas).
// Sửa PDF thì dùng pdfDocument.js (pdf-lib).
//
// Lưu ý: pdf.js vẽ bằng requestAnimationFrame, nên tab/khung trình duyệt đang bị ẩn thì trang chưa hiện.

import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { readBytes } from "@/shared/lib/files";
import { ENCRYPTED_MESSAGE } from "./pdfDocument";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

// Đọc file PDF người dùng chọn. Trả về bytes (để pdf-lib sửa) và doc (để pdf.js vẽ trang).
export async function openPdf(file) {
  const bytes = await readBytes(file);
  try {
    // pdf.js lấy luôn vùng nhớ của dữ liệu, nên đưa cho nó một bản sao.
    const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
    return { bytes, doc };
  } catch (e) {
    if (e?.name === "PasswordException") throw new Error(ENCRYPTED_MESSAGE);
    throw new Error("Không đọc được file PDF (file hỏng hoặc không phải PDF).");
  }
}

// Vẽ trang số `pageNumber` (bắt đầu từ 1) vào một canvas rộng `width` điểm ảnh.
// Trả về { canvas, viewport, rotation }. viewport dùng để đổi toạ độ trên màn hình sang toạ độ trong PDF.
export async function renderPage(doc, pageNumber, width) {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: width / base.width });
  const ratio = window.devicePixelRatio || 1; // vẽ nét hơn trên màn hình độ phân giải cao
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width * ratio);
  canvas.height = Math.floor(viewport.height * ratio);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return { canvas, viewport, rotation: page.rotate };
}
