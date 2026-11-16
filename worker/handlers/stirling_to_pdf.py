"""Các công cụ đổi file sang PDF bằng Stirling-PDF. Mỗi hàm là một handler."""

from pathlib import Path

from . import stirling


def image(input_path: Path, work_dir: Path, options: dict) -> Path:
    # Ảnh đặt vừa trang A4, giữ đúng tỉ lệ; ảnh nằm ngang thì tự xoay trang cho vừa.
    return stirling.post("/api/v1/convert/img/pdf", input_path, work_dir, {
        "fitOption": "maintainAspectRatio",
        "colorType": "color",
        "autoRotate": "true",
    })


def markdown(input_path: Path, work_dir: Path, options: dict) -> Path:
    return stirling.post("/api/v1/convert/markdown/pdf", input_path, work_dir)


def ebook(input_path: Path, work_dir: Path, options: dict) -> Path:
    # Stirling dùng Calibre (có sẵn trong image Docker) để đổi ebook.
    return stirling.post("/api/v1/convert/ebook/pdf", input_path, work_dir, {
        "embedAllFonts": "false",
        "includeTableOfContents": "false",
        "includePageNumbers": "false",
    })


def email(input_path: Path, work_dir: Path, options: dict) -> Path:
    return stirling.post("/api/v1/convert/eml/pdf", input_path, work_dir)


def comic(input_path: Path, work_dir: Path, options: dict) -> Path:
    return stirling.post("/api/v1/convert/cbz/pdf", input_path, work_dir)


def svg(input_path: Path, work_dir: Path, options: dict) -> Path:
    return stirling.post("/api/v1/convert/svg/pdf", input_path, work_dir, {"combineIntoSinglePdf": "false"})


def postscript(input_path: Path, work_dir: Path, options: dict) -> Path:
    return stirling.post("/api/v1/convert/vector/pdf", input_path, work_dir, {"prepress": "false"})
