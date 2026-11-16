"""File Office (Word, Excel, PowerPoint) sang PDF.

Gửi file cho Gotenberg (chạy trong Docker). Bên trong Gotenberg là LibreOffice: nó tự nhận
ra loại file theo đuôi (.docx, .xlsx, .pptx...), nên một handler dùng chung cho cả ba.
"""

import os
from pathlib import Path

import requests

GOTENBERG_URL = os.environ.get("GOTENBERG_URL", "http://localhost:3000").rstrip("/")


def run(input_path: Path, work_dir: Path, options: dict) -> Path:
    # Công cụ này chưa có tuỳ chọn nào nên bỏ qua options.
    with open(input_path, "rb") as f:
        r = requests.post(
            f"{GOTENBERG_URL}/forms/libreoffice/convert",
            files={"files": (input_path.name, f)},
            timeout=300,
        )
    r.raise_for_status()

    output_path = work_dir / "output.pdf"
    output_path.write_bytes(r.content)
    return output_path
