"""Nén PDF: gửi file cho Stirling-PDF (chạy trong Docker), nhận về file PDF nhỏ hơn."""

import os
import shutil
from pathlib import Path

import requests

STIRLING_URL = os.environ.get("STIRLING_URL", "http://localhost:8080").rstrip("/")

# Hiện Stirling đã tắt đăng nhập (xem docker-compose.yml) nên không cần key.
# Nếu sau này bật lại đăng nhập, đặt biến môi trường STIRLING_API_KEY là được, không phải sửa code.
STIRLING_API_KEY = os.environ.get("STIRLING_API_KEY", "")

# Mức nén từ 1 (nhẹ, giữ chất lượng) đến 9 (mạnh, ảnh mờ hơn). 5 là mức mặc định của Stirling.
OPTIMIZE_LEVEL = 5


def run(input_path: Path, work_dir: Path) -> Path:
    headers = {"X-API-KEY": STIRLING_API_KEY} if STIRLING_API_KEY else {}
    with open(input_path, "rb") as f:
        r = requests.post(
            f"{STIRLING_URL}/api/v1/misc/compress-pdf",
            headers=headers,
            files={"fileInput": (input_path.name, f, "application/pdf")},
            data={
                "optimizeLevel": OPTIMIZE_LEVEL,
                "grayscale": "false",
                "linearize": "false",
                "normalize": "false",
            },
            timeout=600,
        )
    if r.status_code == 401:
        raise RuntimeError("Stirling-PDF đòi đăng nhập: tắt đăng nhập hoặc đặt STIRLING_API_KEY.")
    r.raise_for_status()

    output_path = work_dir / "output.pdf"
    output_path.write_bytes(r.content)

    # Có file đã được nén sẵn từ trước, nén lại còn to hơn. Khi đó trả lại file gốc.
    if output_path.stat().st_size >= input_path.stat().st_size:
        shutil.copyfile(input_path, output_path)

    return output_path
