import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite: công cụ chạy thử và đóng gói trang React.
//   npm run dev    chạy thử ở http://localhost:5173 (sửa code là trang tự cập nhật);
//                  các lệnh gọi /api được chuyển tới API .NET ở cổng 5100.
//   npm run build  đóng gói vào wwwroot của project API (api/src/CongCuFile.Api/wwwroot)
//                  để API .NET phục vụ luôn (http://localhost:5100).
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../api/src/CongCuFile.Api/wwwroot",
    emptyOutDir: false, // file cũ do scripts/clean.mjs xoá (xem giải thích trong file đó)
    chunkSizeWarningLimit: 1500,
  },
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:5100" },
  },
});
