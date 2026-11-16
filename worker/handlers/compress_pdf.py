"""Nén PDF: gửi file cho Stirling-PDF, nhận về file PDF nhỏ hơn."""

import shutil
from pathlib import Path

from . import stirling

# Mức nén từ 1 (nhẹ, giữ chất lượng) đến 9 (mạnh, ảnh mờ hơn).
# Người dùng chọn qua tuỳ chọn "level" (API chỉ cho 4, 5 hoặc 8); không có thì dùng 5.
DEFAULT_LEVEL = 5


def run(input_path: Path, work_dir: Path, options: dict) -> Path:
    level = int(options.get("level", DEFAULT_LEVEL))
    if not 1 <= level <= 9:
        raise ValueError(f"Mức nén phải từ 1 đến 9, nhận được {level}")

    output_path = stirling.post("/api/v1/misc/compress-pdf", input_path, work_dir, {
        "optimizeLevel": level,
        "grayscale": "false",
        "linearize": "false",
        "normalize": "false",
    })

    # Có file đã được nén sẵn từ trước, nén lại còn to hơn. Khi đó trả lại file gốc.
    if output_path.stat().st_size >= input_path.stat().st_size:
        shutil.copyfile(input_path, output_path)

    return output_path
