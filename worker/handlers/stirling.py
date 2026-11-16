"""Hàm dùng chung để gửi một file cho Stirling-PDF (chạy trong Docker) và nhận về file PDF.

Các handler dùng Stirling chỉ cần gọi post(...) với địa chỉ chức năng và các tham số.
Danh sách chức năng và tham số: http://localhost:8080/v1/api-docs
"""

import os
from pathlib import Path

import requests

STIRLING_URL = os.environ.get("STIRLING_URL", "http://localhost:8080").rstrip("/")

# Hiện Stirling đã tắt đăng nhập (xem docker-compose.yml) nên không cần key.
# Nếu sau này bật lại đăng nhập, đặt biến môi trường STIRLING_API_KEY là được, không phải sửa code.
STIRLING_API_KEY = os.environ.get("STIRLING_API_KEY", "")


def post(endpoint: str, input_path: Path, work_dir: Path, data: dict | None = None) -> Path:
    """Gửi input_path tới Stirling (ví dụ endpoint="/api/v1/convert/img/pdf"), lưu kết quả thành output.pdf."""
    headers = {"X-API-KEY": STIRLING_API_KEY} if STIRLING_API_KEY else {}
    with open(input_path, "rb") as f:
        r = requests.post(
            f"{STIRLING_URL}{endpoint}",
            headers=headers,
            files={"fileInput": (input_path.name, f)},
            data=data or {},
            timeout=600,
        )
    if r.status_code == 401:
        raise RuntimeError("Stirling-PDF đòi đăng nhập: tắt đăng nhập hoặc đặt STIRLING_API_KEY.")
    r.raise_for_status()

    # Phòng trường hợp Stirling trả về thứ khác (ví dụ file .zip) thay vì PDF.
    if not r.content.startswith(b"%PDF"):
        raise RuntimeError(f"Stirling-PDF không trả về file PDF (kiểu nhận được: {r.headers.get('content-type')}).")

    output_path = work_dir / "output.pdf"
    output_path.write_bytes(r.content)
    return output_path
