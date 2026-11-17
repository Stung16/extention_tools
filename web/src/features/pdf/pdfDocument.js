// Mở PDF để sửa bằng pdf-lib, nhúng phông tiếng Việt. Không dùng DOM nên chạy được cả trong test (Node).

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";

export const ENCRYPTED_MESSAGE = "File này có mật khẩu. Hãy dùng công cụ Mở khoá PDF trước.";

// Mở PDF bằng pdf-lib để sửa. Lỗi thì ném Error có câu tiếng Việt.
export async function loadForEdit(bytes) {
  try {
    return await PDFDocument.load(bytes);
  } catch (e) {
    if (String(e).includes("encrypted")) throw new Error(ENCRYPTED_MESSAGE);
    throw new Error("Không đọc được file PDF để sửa.");
  }
}

// Phông Be Vietnam Pro (giấy phép OFL, file ở web/public/fonts) để viết được tiếng Việt có dấu.
// Phông có sẵn của PDF như Helvetica không có chữ "ệ", "ở"...
const FONT_URL = "/fonts/BeVietnamPro-Regular.ttf";
let fontBytesPromise = null;

// Tải phông một lần, các lần sau dùng lại.
export function loadVietFont() {
  fontBytesPromise ??= fetch(FONT_URL).then((r) => {
    if (!r.ok) throw new Error("Không tải được phông chữ tiếng Việt.");
    return r.arrayBuffer();
  });
  return fontBytesPromise;
}

// Nhúng phông vào PDF (chỉ nhúng những chữ có dùng, để file không to ra nhiều).
export async function embedVietFont(pdfDoc, fontBytes) {
  pdfDoc.registerFontkit(fontkit);
  return pdfDoc.embedFont(fontBytes, { subset: true });
}

// Màu "#rrggbb" -> màu của pdf-lib.
export function hexToRgb(hex) {
  const part = (i) => parseInt(hex.slice(i, i + 2), 16) / 255;
  return rgb(part(1), part(3), part(5));
}
