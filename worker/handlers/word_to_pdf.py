"""Word sang PDF: gửi file cho Gotenberg (chạy trong Docker), nhận về file PDF."""

import os
from pathlib import Path

import requests

GOTENBERG_URL = os.environ.get("GOTENBERG_URL", "http://localhost:3000").rstrip("/")


def run(input_path: Path, work_dir: Path) -> Path:
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
