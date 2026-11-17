//! Trình giám sát Công Cụ File (app desktop, Tauri).
//!
//! Phần Rust chỉ làm "người đưa thư": giao diện (thư mục ui/, HTML/CSS/JS) gọi các lệnh trong commands.rs,
//! Rust gọi API của hệ thống rồi trả kết quả về. Giao diện không gọi thẳng API được vì API không mở
//! CORS (quy tắc trình duyệt chặn trang web gọi sang địa chỉ khác), còn Rust thì không bị chặn.
//!
//!   commands.rs   lệnh cho giao diện (lớp mỏng)
//!   admin_api.rs  gọi cửa quản trị của API, đổi lỗi thành câu tiếng Việt
//!   services.rs   kiểm tra Stirling-PDF, Gotenberg, Ollama... có đang chạy không

// Bản release trên Windows: không mở thêm cửa sổ dòng lệnh đen phía sau.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod admin_api;
mod commands;
mod services;
#[cfg(test)]
mod test_server;

fn main() {
    tauri::Builder::default()
        .manage(commands::AppState::default())
        .invoke_handler(tauri::generate_handler![commands::overview, commands::job_action, commands::check_services])
        .run(tauri::generate_context!())
        .expect("không mở được cửa sổ trình giám sát");
}
