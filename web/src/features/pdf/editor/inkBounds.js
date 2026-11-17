// Tìm khung bao quanh phần có nét (điểm ảnh không trong suốt) để cắt sát ảnh chữ ký.
//   data    mảng RGBA của canvas (ImageData.data), width, height  kích thước canvas
//   trả về  { x, y, w, h } đã thêm lề `pad`, hoặc null nếu canvas trống
export function inkBounds(data, width, height, pad = 6) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 10) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX - pad, y: minY - pad, w: maxX - minX + 1 + pad * 2, h: maxY - minY + 1 + pad * 2 };
}
