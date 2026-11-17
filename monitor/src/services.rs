//! Kiểm tra các dịch vụ phụ (Stirling-PDF, Gotenberg, Ollama...) có đang chạy không.

use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

/// Mỗi dịch vụ chỉ chờ tối đa chừng này.
/// (Trên Windows, cổng không có chương trình nào nghe thường cũng mất ~2 giây mới báo lỗi.)
pub const CHECK_TIMEOUT: Duration = Duration::from_secs(2);

/// Dịch vụ cần kiểm tra (giao diện gửi lên, xem ui/js/settings.js).
#[derive(Debug, Deserialize)]
pub struct ServiceTarget {
    pub name: String,
    pub url: String,
}

/// Kết quả kiểm tra một dịch vụ (trả về giao diện).
#[derive(Debug, Serialize)]
pub struct ServiceStatus {
    pub name: String,
    pub url: String,
    pub up: bool,
    pub millis: u64,
    pub detail: String,
}

/// Kiểm tra tất cả CÙNG LÚC (không lần lượt), nên tổng thời gian chỉ bằng dịch vụ chậm nhất.
pub async fn check_all(http: &reqwest::Client, targets: Vec<ServiceTarget>) -> Vec<ServiceStatus> {
    futures::future::join_all(targets.into_iter().map(|t| check_one(http, t))).await
}

/// "Đang chạy" = trả lời bất kỳ mã HTTP nào (kể cả 404): nghĩa là có chương trình đang nghe ở cổng đó.
async fn check_one(http: &reqwest::Client, target: ServiceTarget) -> ServiceStatus {
    let started = Instant::now();
    let result = http.get(&target.url).timeout(CHECK_TIMEOUT).send().await;
    let millis = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);
    let (up, detail) = match result {
        Ok(r) => (true, format!("HTTP {}", r.status().as_u16())),
        Err(e) if e.is_timeout() => (false, format!("Không trả lời trong {} giây", CHECK_TIMEOUT.as_secs())),
        Err(_) => (false, "Không kết nối được".into()),
    };
    ServiceStatus { name: target.name, url: target.url, up, millis, detail }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_server::{FakeServer, Reply, closed_port_url};

    #[tokio::test]
    async fn any_http_answer_counts_as_up_and_order_is_kept() {
        let server = FakeServer::start(vec![Reply::json(404, "{}")]).await;
        let down = closed_port_url().await;
        let targets = vec![
            ServiceTarget { name: "Tắt".into(), url: down.clone() },
            ServiceTarget { name: "Bật".into(), url: server.url.clone() },
        ];
        let result = check_all(&reqwest::Client::new(), targets).await;
        assert_eq!(result.iter().map(|s| s.name.as_str()).collect::<Vec<_>>(), ["Tắt", "Bật"]);
        assert!(!result[0].up);
        // Cổng đóng: Linux báo lỗi ngay, Windows thường chờ hết 2 giây mới báo.
        assert!(["Không kết nối được", "Không trả lời trong 2 giây"].contains(&result[0].detail.as_str()));
        assert!(result[1].up);
        assert_eq!(result[1].detail, "HTTP 404");
    }
}
