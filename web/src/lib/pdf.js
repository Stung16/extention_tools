// Làm việc với PDF ngay trên trình duyệt (file không gửi lên máy chủ).
//   pdf.js (của Mozilla)  : đọc PDF và vẽ từng trang ra màn hình
//   pdf-lib               : sửa PDF (thêm chữ, ảnh, xoay, gộp, cắt...) rồi lưu file mới

import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { PDFDocument } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

// Đọc file PDF người dùng chọn. Trả về bytes (để pdf-lib sửa) và doc (để pdf.js vẽ trang).
export async function openPdf(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    // pdf.js lấy luôn vùng nhớ của dữ liệu, nên đưa cho nó một bản sao.
    const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
    return { bytes, doc };
  } catch (e) {
    if (e?.name === "PasswordException") {
      throw new Error("File này có mật khẩu. Hãy dùng công cụ Mở khoá PDF trước.");
    }
    throw new Error("Không đọc được file PDF (file hỏng hoặc không phải PDF).");
  }
}

// Mở PDF bằng pdf-lib để sửa.
export async function loadForEdit(bytes) {
  try {
    return await PDFDocument.load(bytes);
  } catch (e) {
    if (String(e).includes("encrypted")) {
      throw new Error("File này có mật khẩu. Hãy dùng công cụ Mở khoá PDF trước.");
    }
    throw new Error("Không đọc được file PDF để sửa.");
  }
}

// Vẽ trang số `pageNumber` (bắt đầu từ 1) vào một canvas rộng `width` điểm ảnh.
// Trả về { canvas, viewport }. viewport dùng để đổi toạ độ trên màn hình sang toạ độ trong PDF.
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

// Nhúng phông chữ Be Vietnam Pro vào PDF để viết được tiếng Việt có dấu.
// (Phông có sẵn của PDF như Helvetica không có chữ "ệ", "ở"...)
let fontBytesPromise = null;
export async function embedVietFont(pdfDoc) {
  pdfDoc.registerFontkit(fontkit);
  fontBytesPromise ??= fetch("/fonts/BeVietnamPro-Regular.ttf").then((r) => r.arrayBuffer());
  return pdfDoc.embedFont(await fontBytesPromise, { subset: true });
}
