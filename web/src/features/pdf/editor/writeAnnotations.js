import { degrees, LineCapStyle, rgb } from "pdf-lib";
import { embedVietFont, hexToRgb, loadForEdit } from "../pdfDocument";
import { HIGHLIGHT } from "./editorModes";

// Vẽ những thứ người dùng đặt lên trang vào PDF thật rồi lưu.
//
// Vật thể lưu theo toạ độ điểm ảnh trên màn hình. Đổi sang toạ độ PDF bằng viewport của pdf.js
// (viewport.convertToPdfPoint đã tính sẵn lề cắt và trang bị xoay; viewport.scale = điểm ảnh / đơn vị PDF).
//
//   objects    { [số trang]: [vật thể...] } (xem pageObjects.js)
//   viewports  { [số trang]: viewport } của các trang đã vẽ trên màn hình
//   loadFont   hàm async trả phông tiếng Việt (chỉ gọi khi có chữ)
export async function writeAnnotations(bytes, objects, viewports, { loadFont }) {
  const doc = await loadForEdit(bytes);
  const hasText = Object.values(objects).some((list) => list.some((o) => o.type === "text"));
  const font = hasText ? await embedVietFont(doc, await loadFont()) : null;
  const images = new Map(); // cùng một ảnh đặt nhiều lần chỉ nhúng một lần

  for (const [num, list] of Object.entries(objects)) {
    if (!list.length) continue;
    const page = doc.getPage(Number(num) - 1);
    const vp = viewports[num];
    const toPdf = (x, y) => vp.convertToPdfPoint(x, y);
    const k = 1 / vp.scale; // điểm ảnh trên màn hình -> đơn vị PDF
    const rotate = degrees(page.getRotation().angle);

    for (const o of list) {
      if (o.type === "text") drawText(page, o, { toPdf, k, font, rotate });
      else if (o.type === "highlight" || o.type === "whiteout") drawBox(page, o, toPdf);
      else if (o.type === "draw") drawInk(page, o, { toPdf, k });
      else if (o.type === "image") {
        if (!images.has(o.src)) images.set(o.src, await embedImage(doc, o.src));
        // Neo ảnh ở góc dưới-trái (theo hướng nhìn trên màn hình).
        const [x, y] = toPdf(o.x, o.y + o.h);
        page.drawImage(images.get(o.src), { x, y, width: o.w * k, height: o.h * k, rotate });
      }
    }
  }
  return doc.save();
}

function drawText(page, o, { toPdf, k, font, rotate }) {
  o.text.split("\n").forEach((line, i) => {
    if (!line) return;
    // Trên màn hình chữ neo ở mép trên; trong PDF neo ở chân chữ: dời xuống ~1 cỡ chữ. Giãn dòng 1,3.
    const [x, y] = toPdf(o.x, o.y + o.size * 0.95 + i * o.size * 1.3);
    page.drawText(line, { x, y, size: o.size * k, font, color: hexToRgb(o.color), rotate });
  });
}

function drawBox(page, o, toPdf) {
  const [x1, y1] = toPdf(o.x, o.y);
  const [x2, y2] = toPdf(o.x + o.w, o.y + o.h);
  const highlight = o.type === "highlight";
  page.drawRectangle({
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
    color: highlight ? rgb(...HIGHLIGHT.rgb) : rgb(1, 1, 1),
    opacity: highlight ? HIGHLIGHT.opacity : 1,
  });
}

function drawInk(page, o, { toPdf, k }) {
  for (let i = 1; i < o.points.length; i++) {
    const [sx, sy] = toPdf(...o.points[i - 1]);
    const [ex, ey] = toPdf(...o.points[i]);
    page.drawLine({
      start: { x: sx, y: sy },
      end: { x: ex, y: ey },
      thickness: o.width * k,
      color: hexToRgb(o.color),
      lineCap: LineCapStyle.Round,
    });
  }
}

async function embedImage(doc, src) {
  const bytes = await fetch(src).then((r) => r.arrayBuffer());
  return src.startsWith("data:image/png") ? doc.embedPng(bytes) : doc.embedJpg(bytes);
}
