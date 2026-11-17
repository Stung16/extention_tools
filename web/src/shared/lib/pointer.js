// "Giữ" con trỏ chuột/ngón tay cho phần tử đang kéo, để kéo ra ngoài vẫn nhận được sự kiện.
// Một số trình duyệt/thiết bị báo lỗi khi gọi: bỏ qua lỗi, thao tác vẫn chạy bình thường.
export function capturePointer(element, pointerId) {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    /* không sao */
  }
}

// Vị trí con trỏ tính từ góc trên-trái của phần tử (điểm ảnh trên màn hình).
// clamp = true: giữ trong khung phần tử (kéo ra ngoài thì dừng ở mép).
export function pointIn(element, event, clamp = false) {
  const r = element.getBoundingClientRect();
  const x = event.clientX - r.left;
  const y = event.clientY - r.top;
  if (!clamp) return { x, y };
  return { x: Math.min(Math.max(x, 0), r.width), y: Math.min(Math.max(y, 0), r.height) };
}

// Khung chữ nhật từ hai điểm (điểm bấm và điểm đang kéo), theo chiều nào cũng được.
export function rectBetween(a, b) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}
