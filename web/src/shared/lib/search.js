// Chuẩn hoá chữ để tìm kiếm: bỏ dấu tiếng Việt, viết thường. "Nén PDF" khớp với "nen pdf".
// NFD tách chữ có dấu thành chữ gốc + dấu (U+0300..U+036F), rồi xoá phần dấu. Riêng "đ" phải đổi tay.
const COMBINING_MARKS = /[̀-ͯ]/g;

export function toSearchText(text) {
  return text.normalize("NFD").replace(COMBINING_MARKS, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
}
