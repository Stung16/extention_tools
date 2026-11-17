// Tính bố cục khi gộp nhiều ảnh thành một (hàm thuần, test được).
//   Ghép dọc: mọi ảnh cùng chiều rộng, bằng ảnh rộng nhất (để không làm mờ ảnh đẹp nhất).
//   Ghép ngang: mọi ảnh cùng chiều cao, bằng ảnh cao nhất.
//   Ảnh ghép to quá `maxSide` (trình duyệt không vẽ được) thì thu nhỏ cả ảnh theo tỉ lệ `scale`.
//
//   sizes   [{ width, height }] kích thước gốc từng ảnh
//   trả về  { width, height, scale, places: [{ x, y, w, h }] } (places tính theo kích thước sau khi thu nhỏ),
//           hoặc null nếu chưa có ảnh
export const MAX_SIDE = 16000;

export function mergeLayout(sizes, direction, gap, maxSide = MAX_SIDE) {
  if (!sizes.length) return null;
  const vertical = direction === "vertical";
  const common = Math.max(...sizes.map((s) => (vertical ? s.width : s.height)));
  const scaled = sizes.map((s) =>
    vertical
      ? { w: common, h: Math.round((s.height * common) / s.width) }
      : { w: Math.round((s.width * common) / s.height), h: common },
  );
  const along = scaled.reduce((sum, s) => sum + (vertical ? s.h : s.w), 0) + gap * (sizes.length - 1);
  const fullW = vertical ? common : along;
  const fullH = vertical ? along : common;
  const scale = Math.min(1, maxSide / Math.max(fullW, fullH));

  let offset = 0;
  const places = scaled.map(({ w, h }) => {
    const [x, y] = vertical ? [0, offset] : [offset, 0];
    offset += (vertical ? h : w) + gap;
    return { x: x * scale, y: y * scale, w: w * scale, h: h * scale };
  });
  return { width: Math.round(fullW * scale), height: Math.round(fullH * scale), scale, places };
}
