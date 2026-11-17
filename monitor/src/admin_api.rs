//! Gọi cửa quản trị của API (/api/admin/...), đổi lỗi thành câu tiếng Việt cho người dùng.
//!
//! Hàm thuần (`endpoint`, `error_message`, `JobAction::parse`, `validate_job_id`) tách riêng để test không cần mạng.

use std::time::Duration;

use serde_json::Value;

/// Header chứa mã quản trị (trùng ADMIN_KEY / AdminKey của API).
const ADMIN_KEY_HEADER: &str = "X-Admin-Key";
/// Hỏi API quá thời gian này thì báo "không trả lời".
pub const REQUEST_TIMEOUT: Duration = Duration::from_secs(5);

/// Thao tác quản trị trên một job.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum JobAction {
    /// Thử lại job lỗi hoặc đã huỷ (đưa về cuối hàng chờ).
    Retry,
    /// Huỷ job đang chờ.
    Cancel,
}

impl JobAction {
    /// Đọc tên thao tác giao diện gửi lên ("retry" | "cancel").
    pub fn parse(action: &str) -> Result<Self, String> {
        match action {
            "retry" => Ok(Self::Retry),
            "cancel" => Ok(Self::Cancel),
            other => Err(format!("Không có thao tác '{other}'.")),
        }
    }

    fn path(self) -> &'static str {
        match self {
            Self::Retry => "retry",
            Self::Cancel => "cancel",
        }
    }
}

/// Id job là Guid: chỉ chữ số, a-f và dấu gạch. Kiểm tra để không ai chèn thêm gì vào đường dẫn.
pub fn validate_job_id(id: &str) -> Result<(), String> {
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_hexdigit() || c == '-') {
        return Err("Mã job không hợp lệ.".into());
    }
    Ok(())
}

/// Ghép địa chỉ API với đường dẫn, bỏ dấu "/" thừa ở cuối địa chỉ.
pub fn endpoint(api_url: &str, path: &str) -> String {
    format!("{}{path}", api_url.trim_end_matches('/'))
}

/// Câu báo khi không gọi được API (tắt, sai địa chỉ, quá giờ).
pub fn connection_error_message(api_url: &str, is_timeout: bool) -> String {
    if is_timeout {
        format!("API {api_url} không trả lời trong {} giây.", REQUEST_TIMEOUT.as_secs())
    } else {
        format!("Không kết nối được API {api_url}. Kiểm tra API đã chạy chưa, hoặc sửa địa chỉ trong Cài đặt.")
    }
}

/// Câu báo khi API trả mã lỗi. API trả lỗi dạng {"error": "..."} (câu tiếng Việt) thì dùng luôn câu đó.
pub fn error_message(status: u16, body: &Value) -> String {
    match (status, body.get("error").and_then(Value::as_str)) {
        (401, _) => {
            "API từ chối: mã quản trị không khớp. Sửa trong Cài đặt cho trùng ADMIN_KEY (AdminKey) của API.".into()
        }
        (404, None) => "API này chưa có tính năng giám sát: hãy chạy bản API mới.".into(),
        (_, Some(msg)) => msg.into(),
        _ => format!("API báo lỗi HTTP {status}."),
    }
}

/// Client gọi cửa quản trị. Dùng chung một reqwest::Client (giữ kết nối, nhanh hơn tạo mới mỗi lần).
pub struct AdminApi<'a> {
    pub http: &'a reqwest::Client,
    pub api_url: &'a str,
    pub key: &'a str,
}

impl AdminApi<'_> {
    /// Số liệu tổng quan: chuyển nguyên JSON của GET /api/admin/overview cho giao diện.
    pub async fn overview(&self) -> Result<Value, String> {
        let r = self.send(self.http.get(endpoint(self.api_url, "/api/admin/overview"))).await?;
        r.json().await.map_err(|e| format!("Không đọc được dữ liệu API trả về: {e}"))
    }

    /// POST /api/admin/jobs/{id}/retry | cancel
    pub async fn job_action(&self, id: &str, action: JobAction) -> Result<(), String> {
        validate_job_id(id)?;
        let url = endpoint(self.api_url, &format!("/api/admin/jobs/{id}/{}", action.path()));
        self.send(self.http.post(url)).await.map(|_| ())
    }

    /// Gửi request kèm mã quản trị; mã HTTP lỗi thì đổi thành câu báo.
    async fn send(&self, request: reqwest::RequestBuilder) -> Result<reqwest::Response, String> {
        let r = request
            .header(ADMIN_KEY_HEADER, self.key)
            .timeout(REQUEST_TIMEOUT)
            .send()
            .await
            .map_err(|e| connection_error_message(self.api_url, e.is_timeout()))?;
        if r.status().is_success() {
            return Ok(r);
        }
        let status = r.status().as_u16();
        let body = r.json().await.unwrap_or_default();
        Err(error_message(status, &body))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_server::{FakeServer, Reply};
    use serde_json::json;

    #[test]
    fn endpoint_trims_trailing_slashes() {
        assert_eq!(endpoint("http://may:5100//", "/api/x"), "http://may:5100/api/x");
        assert_eq!(endpoint("http://may:5100", "/api/x"), "http://may:5100/api/x");
    }

    #[test]
    fn job_action_and_id_are_checked() {
        assert_eq!(JobAction::parse("retry"), Ok(JobAction::Retry));
        assert_eq!(JobAction::parse("cancel"), Ok(JobAction::Cancel));
        assert!(JobAction::parse("delete").is_err());
        assert!(validate_job_id("3f2a-09bc").is_ok());
        assert!(validate_job_id("").is_err());
        assert!(validate_job_id("../../api/admin").is_err());
        assert!(validate_job_id("abc?x=1").is_err());
    }

    #[test]
    fn error_messages_are_vietnamese() {
        assert!(error_message(401, &json!({})).contains("mã quản trị không khớp"));
        assert!(error_message(404, &Value::Null).contains("chưa có tính năng giám sát"));
        assert_eq!(error_message(404, &json!({"error": "Không tìm thấy job."})), "Không tìm thấy job.");
        assert_eq!(error_message(409, &json!({"error": "Job đang chạy."})), "Job đang chạy.");
        assert_eq!(error_message(500, &Value::Null), "API báo lỗi HTTP 500.");
        assert!(connection_error_message("http://x", true).contains("5 giây"));
    }

    #[tokio::test]
    async fn overview_sends_admin_key_and_returns_json() {
        let server = FakeServer::start(vec![Reply::json(200, r#"{"totals":{"pending":2}}"#)]).await;
        let http = reqwest::Client::new();
        let api = AdminApi { http: &http, api_url: &server.url, key: "ma-bi-mat" };
        let ov = api.overview().await.unwrap();
        assert_eq!(ov["totals"]["pending"], 2);
        let request = server.request(0);
        assert!(request.starts_with("GET /api/admin/overview "));
        assert!(request.to_lowercase().contains("x-admin-key: ma-bi-mat"));
    }

    #[tokio::test]
    async fn job_action_posts_and_reports_api_error() {
        let server = FakeServer::start(vec![
            Reply::json(200, "{}"),
            Reply::json(409, r#"{"error":"Chỉ huỷ được job đang chờ."}"#),
        ])
        .await;
        let http = reqwest::Client::new();
        let api = AdminApi { http: &http, api_url: &server.url, key: "k" };
        api.job_action("ab-12", JobAction::Retry).await.unwrap();
        assert!(server.request(0).starts_with("POST /api/admin/jobs/ab-12/retry "));
        let err = api.job_action("ab-12", JobAction::Cancel).await.unwrap_err();
        assert_eq!(err, "Chỉ huỷ được job đang chờ.");
    }

    #[tokio::test]
    async fn unreachable_api_gives_hint() {
        let http = reqwest::Client::new();
        let url = crate::test_server::closed_port_url().await;
        let api = AdminApi { http: &http, api_url: &url, key: "k" };
        let err = api.overview().await.unwrap_err();
        assert!(err.contains("Không kết nối được API"), "{err}");
    }
}
