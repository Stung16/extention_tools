//! Các lệnh giao diện gọi được (window.__TAURI__.core.invoke("tên lệnh", {...})).
//!
//! Chỉ là lớp mỏng: nhận tham số từ giao diện, gọi admin_api / services, trả kết quả.
//! Tham số viết snake_case ở đây, bên JavaScript viết camelCase (api_url <-> apiUrl), Tauri tự đổi.

use tauri::State;

use crate::admin_api::{AdminApi, JobAction};
use crate::services::{self, ServiceStatus, ServiceTarget};

/// Dữ liệu dùng chung cho mọi lệnh: một HTTP client (giữ kết nối để hỏi API mỗi 2 giây cho nhanh).
#[derive(Default)]
pub struct AppState {
    http: reqwest::Client,
}

/// Số liệu tổng quan (GET /api/admin/overview).
#[tauri::command]
pub async fn overview(state: State<'_, AppState>, api_url: String, key: String) -> Result<serde_json::Value, String> {
    AdminApi { http: &state.http, api_url: &api_url, key: &key }.overview().await
}

/// Thử lại job lỗi / đã huỷ (action = "retry") hoặc huỷ job đang chờ (action = "cancel").
#[tauri::command]
pub async fn job_action(
    state: State<'_, AppState>,
    api_url: String,
    key: String,
    id: String,
    action: String,
) -> Result<(), String> {
    let action = JobAction::parse(&action)?;
    AdminApi { http: &state.http, api_url: &api_url, key: &key }.job_action(&id, action).await
}

/// Kiểm tra cùng lúc các dịch vụ phụ.
#[tauri::command]
pub async fn check_services(
    state: State<'_, AppState>,
    targets: Vec<ServiceTarget>,
) -> Result<Vec<ServiceStatus>, String> {
    Ok(services::check_all(&state.http, targets).await)
}
