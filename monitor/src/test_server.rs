//! Máy chủ HTTP giả cho test: trả lần lượt các câu trả lời định sẵn, ghi lại request đã nhận.

use std::sync::{Arc, Mutex};

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

pub struct Reply {
    status: u16,
    body: String,
}

impl Reply {
    pub fn json(status: u16, body: &str) -> Self {
        Self { status, body: body.into() }
    }
}

pub struct FakeServer {
    pub url: String,
    requests: Arc<Mutex<Vec<String>>>,
}

impl FakeServer {
    /// Mở cổng ngẫu nhiên trên 127.0.0.1; mỗi kết nối nhận một câu trả lời theo thứ tự.
    pub async fn start(replies: Vec<Reply>) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let requests = Arc::new(Mutex::new(Vec::new()));
        let seen = requests.clone();
        tokio::spawn(async move {
            for reply in replies {
                let (mut socket, _) = listener.accept().await.unwrap();
                let mut buf = vec![0u8; 8192];
                let n = socket.read(&mut buf).await.unwrap();
                seen.lock().unwrap().push(String::from_utf8_lossy(&buf[..n]).into_owned());
                let response = format!(
                    "HTTP/1.1 {} X\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    reply.status,
                    reply.body.len(),
                    reply.body
                );
                socket.write_all(response.as_bytes()).await.unwrap();
            }
        });
        Self { url, requests }
    }

    /// Request thứ `i` máy chủ đã nhận (dòng đầu + header).
    pub fn request(&self, i: usize) -> String {
        self.requests.lock().unwrap()[i].clone()
    }
}

/// Địa chỉ một cổng không có chương trình nào nghe (mở cổng rồi đóng ngay).
pub async fn closed_port_url() -> String {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    drop(listener);
    url
}
