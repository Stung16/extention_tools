// Các chế độ (công cụ) của trình sửa PDF và bộ chế độ cho từng trang: Sửa PDF, Ghi chú PDF, Ký PDF.

export const MODES = {
  select: { label: "Chọn / di chuyển", icon: "↖" },
  text: { label: "Thêm chữ", icon: "T" },
  draw: { label: "Bút vẽ", icon: "✎" },
  highlight: { label: "Tô sáng", icon: "▮" },
  whiteout: { label: "Che trắng", icon: "▭" },
  image: { label: "Chèn ảnh", icon: "🖼" },
  signature: { label: "Chữ ký", icon: "✍" },
};

// modes: các nút trên thanh công cụ; initial: chế độ khi mở file.
export const EDITOR_PRESETS = {
  edit: { modes: ["select", "text", "whiteout", "image", "draw", "highlight", "signature"], initial: "text" },
  annotate: { modes: ["select", "highlight", "text", "draw"], initial: "highlight" },
  sign: { modes: ["select", "signature", "text"], initial: "signature" },
};

export const INK_COLORS = ["#111111", "#1d3b8f", "#c0262d", "#0b7a3b"];

// Tô sáng: màu vàng trong suốt. Trên màn hình và trong PDF phải giống nhau.
export const HIGHLIGHT = { css: "rgba(255, 221, 0, 0.42)", rgb: [1, 0.87, 0], opacity: 0.42 };
