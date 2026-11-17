// Dữ liệu những thứ người dùng đặt lên trang (chữ, nét vẽ, khung tô sáng / che trắng, ảnh, chữ ký).
// Hàm thuần: nhận dữ liệu cũ, trả dữ liệu mới (không sửa trực tiếp), dùng được với setState của React.
//
//   objects  { [số trang]: [vật thể...] }
//   vật thể  { id, type: "text" | "draw" | "highlight" | "whiteout" | "image", ... }  toạ độ là điểm ảnh trên màn hình
//     text      { x, y, text, size, color }
//     draw      { points: [[x, y], ...], color, width }
//     highlight / whiteout  { x, y, w, h }
//     image     { x, y, w, h, src (data URL PNG/JPG) }

let nextId = 1;
export const newId = () => nextId++;

export function addObject(objects, page, obj) {
  return { ...objects, [page]: [...(objects[page] || []), obj] };
}

// patch: các trường mới, hoặc hàm (vật thể cũ) -> các trường mới.
export function updateObject(objects, page, id, patch) {
  const apply = (o) => ({ ...o, ...(typeof patch === "function" ? patch(o) : patch) });
  return { ...objects, [page]: (objects[page] || []).map((o) => (o.id === id ? apply(o) : o)) };
}

export function removeObject(objects, page, id) {
  return { ...objects, [page]: (objects[page] || []).filter((o) => o.id !== id) };
}

export function countObjects(objects) {
  return Object.values(objects).reduce((n, list) => n + list.length, 0);
}

// Khung quá nhỏ coi như bấm nhầm.
export const isTinyRect = (o) => o.w < 4 || o.h < 4;

// Đặt ảnh (hoặc chữ ký) vào giữa trang, thu nhỏ cho vừa.
export function centeredImage(src, natW, natH, view, maxWidth) {
  const w = Math.min(maxWidth, natW);
  const h = (w * natH) / natW;
  return { id: newId(), type: "image", src, x: (view.width - w) / 2, y: view.height / 2 - h / 2, w, h };
}
