//! Trình giám sát Công Cụ File (app desktop, Tauri).
//!
//! Phần Rust này chỉ làm "người đưa thư": giao diện (thư mục ui/, HTML/CSS/JS) gọi các lệnh bên dưới,
//! Rust gọi API của hệ thống rồi trả kết quả về. Giao diện không gọi thẳng API được vì API không mở
//! CORS (quy tắc trình duyệt chặn trang web gọi sang địa chỉ khác), còn Rust thì không bị chặn.

// Bản release trên Windows: không mở thêm cửa sổ dòng lệnh đen phía sau.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::State;

struct Http(reqwest::Client);

fn api_error(api_url: &str, e: reqwest::Error) -> String {
    if e.is_timeout() {
        format!("API {api_url} không trả lời trong 5 giây.")
    } else {
        format!("Không kết nối được API {api_url}. Kiểm tra API đã chạy chưa, hoặc sửa địa chỉ trong Cài đặt.")
    }
}

/// Đọc lỗi API trả về dạng {"error": "..."} để hiện đúng câu tiếng Việt cho người dùng.
async fn read_error(r: reqwest::Response) -> String {
    let status = r.status().as_u16();
    let body: serde_json::Value = r.json().await.unwrap_or_default();
    match (status, body.get("error").and_then(|e| e.as_str())) {
        (401, _) => "API từ chối: mã quản trị không khớp. Sửa trong Cài đặt cho trùng ADMIN_KEY (AdminKey) của API.".into(),
        (404, None) => "API này chưa có tính năng giám sát: hãy chạy bản API mới.".into(),
        (_, Some(msg)) => msg.into(),
        _ => format!("API báo lỗi HTTP {status}."),
    }
}

/// Số liệu tổng quan: chuyển nguyên JSON của GET /api/admin/overview cho giao diện.
#[tauri::command]
async fn overview(http: State<'_, Http>, api_url: String, key: String) -> Result<serde_json::Value, String> {
    let url = format!("{}/api/admin/overview", api_url.trim_end_matches('/'));
    let r = http.0.get(url).header("X-Admin-Key", key).send().await.map_err(|e| api_error(&api_url, e))?;
    if !r.status().is_success() {
        return Err(read_error(r).await);
    }
    r.json().await.map_err(|e| format!("Không đọc được dữ liệu API trả về: {e}"))
}

/// Thử lại job lỗi hoặc đã huỷ (action = "retry"), hoặc huỷ job đang chờ (action = "cancel").
#[tauri::command]
async fn job_action(http: State<'_, Http>, api_url: String, key: String, id: String, action: String) -> Result<(), String> {
    if action != "retry" && action != "cancel" {
        return Err(format!("Không có thao tác '{action}'."));
    }
    // Id là Guid: chỉ chữ số, a-f và dấu gạch, không để chèn thêm gì vào đường dẫn.
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_hexdigit() || c == '-') {
        return Err("Mã job không hợp lệ.".into());
    }
    let url = format!("{}/api/admin/jobs/{id}/{action}", api_url.trim_end_matches('/'));
    let r = http.0.post(url).header("X-Admin-Key", key).send().await.map_err(|e| api_error(&api_url, e))?;
    if r.status().is_success() { Ok(()) } else { Err(read_error(r).await) }
}

#[derive(Deserialize)]
struct ServiceTarget {
    name: String,
    url: String,
}

#[derive(Serialize)]
struct ServiceStatus {
    name: String,
    url: String,
    up: bool,
    millis: u64,
    detail: String,
}

/// Kiểm tra cùng lúc nhiều dịch vụ. "Đang chạy" = trả lời bất kỳ mã HTTP nào trong 2 giây
/// (kể cả 404): nghĩa là có chương trình đang nghe ở cổng đó.
#[tauri::command]
async fn check_services(http: State<'_, Http>, targets: Vec<ServiceTarget>) -> Result<Vec<ServiceStatus>, String> {
    let checks = targets.into_iter().map(|t| {
        let client = http.0.clone();
        async move {
            let started = Instant::now();
            let result = client.get(&t.url).timeout(Duration::from_secs(2)).send().await;
            let millis = started.elapsed().as_millis() as u64;
            let (up, detail) = match result {
                Ok(r) => (true, format!("HTTP {}", r.status().as_u16())),
                // Trên Windows, cổng không có chương trình nào nghe cũng thường mất ~2 giây mới báo lỗi.
                Err(e) if e.is_timeout() => (false, "Không trả lời trong 2 giây".into()),
                Err(_) => (false, "Không kết nối được".into()),
            };
            ServiceStatus { name: t.name, url: t.url, up, millis, detail }
        }
    });
    Ok(futures::future::join_all(checks).await)
}

fn main() {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .expect("không tạo được HTTP client");

    tauri::Builder::default()
        .manage(Http(client))
        .invoke_handler(tauri::generate_handler![overview, job_action, check_services])
        .run(tauri::generate_context!())
        .expect("không mở được cửa sổ trình giám sát");
}
