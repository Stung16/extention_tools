// Trạng thái của cả giao diện, giữ ở một chỗ. Các phần vẽ (views/) chỉ ĐỌC; main.js sửa rồi gọi vẽ lại.

import { loadSettings } from "./settings.js";

export const state = {
  settings: loadSettings(),
  ov: null, // số liệu lần hỏi API gần nhất (GET /api/admin/overview)
  err: null, // câu lỗi khi hỏi API
  fetchedAt: 0, // performance.now() lúc nhận số liệu, để đồng hồ job đang chạy chạy tiếp mỗi giây
  updatedAt: 0, // Date.now() lần hỏi gần nhất (thành công hay lỗi)
  services: [], // kết quả kiểm tra Stirling-PDF, Gotenberg, Ollama
  samples: [], // [{ t, wait, run }] cho biểu đồ, tối đa 30 phút
  tab: "queue", // "queue" | "history" | "tools"
  filter: { history: "all", tools: "active" },
  search: "",
  selected: null, // id job đang mở ở ngăn chi tiết
  confirming: false, // đang chờ bấm lần hai để huỷ job
};

// Số giây từ lúc nhận số liệu tới giờ: cộng vào thời gian chờ/chạy để đồng hồ chạy tiếp giữa hai lần hỏi API.
export const sinceFetch = () => (performance.now() - state.fetchedAt) / 1000;

// Quên số liệu của API cũ (khi đổi cài đặt).
export function resetConnection() {
  Object.assign(state, { ov: null, err: null, samples: [], services: [] });
}
