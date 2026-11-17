"""Các công cụ chỉnh sửa PDF bằng Stirling-PDF (xoay, xoá trang, mật khẩu, watermark...).

Mỗi hàm là một handler. Giá trị trong options đã được API kiểm tra (đúng dạng, không rỗng).
"""

from pathlib import Path

from congcufile_worker.tools.pdf import stirling


def rotate(input_path: Path, work_dir: Path, options: dict) -> Path:
    return stirling.post("/api/v1/general/rotate-pdf", input_path, work_dir, {"angle": int(options.get("angle", 90))})


def remove_pages(input_path: Path, work_dir: Path, options: dict) -> Path:
    return stirling.post("/api/v1/general/remove-pages", input_path, work_dir, {"pageNumbers": _pages(options)})


def extract_pages(input_path: Path, work_dir: Path, options: dict) -> Path:
    return stirling.post(
        "/api/v1/general/rearrange-pages",
        input_path,
        work_dir,
        {
            "pageNumbers": _pages(options),
            "customMode": "CUSTOM",
        },
    )


def protect(input_path: Path, work_dir: Path, options: dict) -> Path:
    return stirling.post(
        "/api/v1/security/add-password",
        input_path,
        work_dir,
        {
            "password": options["password"],
            "keyLength": 256,  # mã hoá AES 256-bit, mạnh nhất Stirling hỗ trợ
        },
    )


def unlock(input_path: Path, work_dir: Path, options: dict) -> Path:
    return stirling.post("/api/v1/security/remove-password", input_path, work_dir, {"password": options["password"]})


def watermark(input_path: Path, work_dir: Path, options: dict) -> Path:
    return stirling.post(
        "/api/v1/security/add-watermark",
        input_path,
        work_dir,
        {
            "watermarkType": "text",
            "watermarkText": options["text"],
            "alphabet": "roman",
            "fontSize": 40,
            "rotation": 45,
            "opacity": 0.25,
            "customColor": "#808080",
        },
    )


def page_numbers(input_path: Path, work_dir: Path, options: dict) -> Path:
    return stirling.post(
        "/api/v1/misc/add-page-numbers",
        input_path,
        work_dir,
        {
            "fontType": "helvetica",
            "position": int(options.get("position", 8)),
            "customText": options.get("format", "{n}"),
            "fontSize": 11,
        },
    )


def ocr(input_path: Path, work_dir: Path, options: dict) -> Path:
    # Nhận dạng chữ tiếng Việt và tiếng Anh. Trang đã có chữ (không phải ảnh scan) thì bỏ qua.
    return stirling.post(
        "/api/v1/misc/ocr-pdf",
        input_path,
        work_dir,
        {
            "languages": ["vie", "eng"],
            "ocrType": "skip-text",
            "ocrRenderType": "hocr",
            "deskew": "true",  # nắn thẳng trang scan bị nghiêng
        },
    )


def _pages(options: dict) -> str:
    # "1, 3, 5 - 7" -> "1,3,5-7"
    return options["pages"].replace(" ", "")
