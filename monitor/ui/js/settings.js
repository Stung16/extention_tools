// Cài đặt (địa chỉ API, mã quản trị), lưu trong máy bằng localStorage; lỡ không lưu được vẫn chạy với mặc định.

const STORAGE_KEY = "monitor.settings";
export const DEFAULTS = { apiUrl: "http://localhost:5100", key: "dev-admin-key" };

export function loadSettings(storage = globalThis.localStorage) {
  try {
    const saved = { ...DEFAULTS, ...JSON.parse(storage.getItem(STORAGE_KEY) || "{}") };
    // Bản cũ dùng mã worker cho cửa quản trị; giờ cửa quản trị có mã riêng.
    if (saved.key === "dev-worker-key") saved.key = DEFAULTS.key;
    return saved;
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings, storage = globalThis.localStorage) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* không lưu được thì thôi */
  }
}

// Giá trị người dùng gõ trong hộp Cài đặt -> cài đặt sạch (bỏ dấu cách, bỏ "/" cuối địa chỉ).
export function settingsFromForm(apiUrl, key) {
  return { apiUrl: apiUrl.trim().replace(/\/+$/, ""), key: key.trim() };
}

// Dịch vụ phụ cần kiểm tra, coi như chạy cùng máy với API.
//   required: tắt thì một nhóm công cụ sẽ lỗi;  affects: nhóm công cụ bị ảnh hưởng
export function serviceTargets(apiUrl) {
  let host = "localhost";
  try {
    host = new URL(apiUrl).hostname;
  } catch {
    /* địa chỉ sai: dùng localhost */
  }
  return [
    { name: "Stirling-PDF", url: `http://${host}:8080/`, required: true, affects: "các công cụ PDF" },
    {
      name: "Gotenberg",
      url: `http://${host}:3000/health`,
      required: true,
      affects: "chuyển Word, Excel, PowerPoint sang PDF",
    },
    { name: "Ollama", url: `http://${host}:11434/`, required: false, affects: "chỉ cần trên máy GPU" },
  ];
}
