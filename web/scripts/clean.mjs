// Xoá các file build cũ trong ../api/wwwroot trước khi build lại.
// Chỉ xoá file, giữ nguyên thư mục: trên Windows, khi API .NET đang chạy nó giữ khoá các thư mục này,
// nên xoá cả thư mục (cách mặc định của Vite) sẽ báo lỗi EBUSY.
import { readdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../api/wwwroot");

function clean(dir) {
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return; // chưa có thư mục: không cần xoá gì
  }
  for (const name of entries) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) clean(path);
    else rmSync(path, { force: true });
  }
}

clean(root);
console.log("Đã xoá file build cũ trong", root);
