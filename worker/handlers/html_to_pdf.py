"""HTML sang PDF: gửi file cho Gotenberg, Gotenberg mở trang bằng trình duyệt Chromium rồi in ra PDF.

Lưu ý: chỉ gửi một file HTML, nên ảnh hay CSS nằm ở file riêng bên cạnh sẽ không có trong PDF.
Ảnh/CSS lấy từ địa chỉ internet (https://...) thì vẫn hiện.
"""

import os
from pathlib import Path

import requests

GOTENBERG_URL = os.environ.get("GOTENBERG_URL", "http://localhost:3000").rstrip("/")


def run(input_path: Path, work_dir: Path, options: dict) -> Path:
    with open(input_path, "rb") as f:
        r = requests.post(
            f"{GOTENBERG_URL}/forms/chromium/convert/html",
            # Gotenberg bắt buộc file HTML chính phải tên là index.html.
            files={"files": ("index.html", f, "text/html")},
            timeout=300,
        )
    r.raise_for_status()

    output_path = work_dir / "output.pdf"
    output_path.write_bytes(r.content)
    return output_path
