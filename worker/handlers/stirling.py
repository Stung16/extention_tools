"""Hàm dùng chung để gửi một file cho Stirling-PDF (chạy trong Docker) và nhận về kết quả.

Các handler dùng Stirling chỉ cần gọi post(...) với địa chỉ chức năng và các tham số.
Danh sách chức năng và tham số: http://localhost:8080/v1/api-docs
"""

import mimetypes
import os
import re
from pathlib import Path
from urllib.parse import unquote

import requests

STIRLING_URL = os.environ.get("STIRLING_URL", "http://localhost:8080").rstrip("/")

# Hiện Stirling đã tắt đăng nhập (xem docker-compose.yml) nên không cần key.
# Nếu sau này bật lại đăng nhập, đặt biến môi trường STIRLING_API_KEY là được, không phải sửa code.
STIRLING_API_KEY = os.environ.get("STIRLING_API_KEY", "")

# Một số lỗi của Stirling, đổi sang câu tiếng Việt dễ hiểu cho người dùng.
FRIENDLY_ERRORS = {
    "/errors/pdf-password": "Sai mật khẩu, hoặc file này cần mật khẩu để mở.",
}


def post(endpoint: str, input_path: Path, work_dir: Path, data: dict | None = None,
         expect: str = ".pdf") -> Path:
    """Gửi input_path tới Stirling (ví dụ endpoint="/api/v1/convert/img/pdf") và lưu kết quả.

    expect: đuôi file mong đợi. Nếu là ".pdf" thì kiểm tra kết quả đúng là PDF.
    Đuôi file thật lấy theo tên file Stirling trả về (ví dụ .docx, .zip), không có thì dùng expect.
    """
    headers = {"X-API-KEY": STIRLING_API_KEY} if STIRLING_API_KEY else {}
    # Phải ghi rõ loại file (ví dụ application/pdf): vài chức năng của Stirling (PDF sang Word,
    # PowerPoint, HTML...) báo lỗi 400 nếu thiếu.
    content_type = mimetypes.guess_type(input_path.name)[0] or "application/octet-stream"
    with open(input_path, "rb") as f:
        r = requests.post(
            f"{STIRLING_URL}{endpoint}",
            headers=headers,
            files={"fileInput": (input_path.name, f, content_type)},
            data=data or {},  # giá trị dạng list (ví dụ nhiều ngôn ngữ OCR) được gửi thành nhiều trường cùng tên
            timeout=1800,
        )
    if r.status_code == 401:
        raise RuntimeError("Stirling-PDF đòi đăng nhập: tắt đăng nhập hoặc đặt STIRLING_API_KEY.")
    if r.status_code >= 400:
        raise RuntimeError(_error_message(r))

    ext = _ext_from_response(r) or expect
    if expect == ".pdf" and not r.content.startswith(b"%PDF"):
        raise RuntimeError(f"Stirling-PDF không trả về file PDF (kiểu nhận được: {r.headers.get('content-type')}).")

    output_path = work_dir / f"output{ext}"
    output_path.write_bytes(r.content)
    return output_path


def _ext_from_response(r: requests.Response) -> str:
    """Lấy đuôi file từ header Content-Disposition, ví dụ filename="abc.docx" -> ".docx"."""
    cd = r.headers.get("content-disposition", "")
    m = re.search(r"filename\*=UTF-8''([^;]+)", cd) or re.search(r'filename="?([^";]+)"?', cd)
    return Path(unquote(m.group(1))).suffix.lower() if m else ""


def _error_message(r: requests.Response) -> str:
    try:
        body = r.json()
    except ValueError:
        return f"Stirling-PDF báo lỗi {r.status_code}." + (f" {r.text[:200]}" if r.text else "")
    if body.get("type") in FRIENDLY_ERRORS:
        return FRIENDLY_ERRORS[body["type"]]
    return f"Stirling-PDF báo lỗi: {body.get('detail') or body.get('title') or r.status_code}"
