// Tiện ích nhỏ làm việc với trang.

export const $ = (id) => document.getElementById(id);

// Thay nội dung một khung nhưng giữ nguyên vị trí cuộn (vẽ lại mỗi 2 giây không làm nhảy bảng).
export function setHtmlKeepScroll(el, html) {
  const top = el.scrollTop;
  el.innerHTML = html;
  el.scrollTop = top;
}

// Thông báo nhỏ góc màn hình, tự ẩn (lỗi hiện lâu hơn).
let toastTimer = 0;
export function toast(text, isError = false) {
  const t = $("toast");
  t.textContent = text;
  t.className = `toast is-shown${isError ? " toast--error" : ""}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = "toast"), isError ? 5000 : 2500);
}
