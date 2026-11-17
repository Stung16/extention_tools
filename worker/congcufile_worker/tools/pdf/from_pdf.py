"""Các công cụ đổi PDF sang định dạng khác bằng Stirling-PDF. Mỗi hàm là một handler."""

import zipfile
from pathlib import Path

from congcufile_worker.tools.pdf import stirling


def word(input_path: Path, work_dir: Path, options: dict) -> Path:
    return stirling.post("/api/v1/convert/pdf/word", input_path, work_dir, {"outputFormat": "docx"}, expect=".docx")


def excel(input_path: Path, work_dir: Path, options: dict) -> Path:
    return stirling.post("/api/v1/convert/pdf/xlsx", input_path, work_dir, expect=".xlsx")


def powerpoint(input_path: Path, work_dir: Path, options: dict) -> Path:
    return stirling.post(
        "/api/v1/convert/pdf/presentation", input_path, work_dir, {"outputFormat": "pptx"}, expect=".pptx"
    )


def text(input_path: Path, work_dir: Path, options: dict) -> Path:
    return stirling.post("/api/v1/convert/pdf/text", input_path, work_dir, {"outputFormat": "txt"}, expect=".txt")


def html(input_path: Path, work_dir: Path, options: dict) -> Path:
    # Kết quả là .zip gồm file HTML và ảnh đi kèm.
    return stirling.post("/api/v1/convert/pdf/html", input_path, work_dir, expect=".zip")


def epub(input_path: Path, work_dir: Path, options: dict) -> Path:
    return stirling.post("/api/v1/convert/pdf/epub", input_path, work_dir, {"outputFormat": "EPUB"}, expect=".epub")


def jpg(input_path: Path, work_dir: Path, options: dict) -> Path:
    return _images(input_path, work_dir, "jpg")


def png(input_path: Path, work_dir: Path, options: dict) -> Path:
    return _images(input_path, work_dir, "png")


def _images(input_path: Path, work_dir: Path, fmt: str) -> Path:
    # Mỗi trang một ảnh, độ phân giải 150 DPI (đủ nét để xem và in thường).
    result = stirling.post(
        "/api/v1/convert/pdf/img",
        input_path,
        work_dir,
        {
            "imageFormat": fmt,
            "singleOrMultiple": "multiple",
            "colorType": "color",
            "dpi": 150,
        },
        expect=".zip",
    )

    # Stirling luôn gói ảnh vào .zip. PDF chỉ có 1 trang thì lấy luôn ảnh ra cho người dùng đỡ phải giải nén.
    if result.suffix == ".zip":
        with zipfile.ZipFile(result) as z:
            names = [n for n in z.namelist() if not n.endswith("/")]
            if len(names) == 1:
                single = work_dir / f"output.{fmt}"
                single.write_bytes(z.read(names[0]))
                return single
    return result
