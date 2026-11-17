"""Đổi sang PDF bằng Gotenberg (chạy trong Docker).

office_to_pdf  Word, Excel, PowerPoint -> PDF. Bên trong Gotenberg là LibreOffice: nó tự nhận ra loại file
               theo đuôi (.docx, .xlsx, .pptx...), nên một handler dùng chung cho cả ba.
html_to_pdf    HTML -> PDF: Gotenberg mở trang bằng trình duyệt Chromium rồi in ra PDF. Chỉ gửi một file
               HTML, nên ảnh hay CSS nằm ở file riêng bên cạnh sẽ không có; ảnh/CSS lấy từ https://... vẫn hiện.
"""

from pathlib import Path

from congcufile_worker.config import settings
from congcufile_worker.core.errors import ToolError
from congcufile_worker.core.services import call_service


def office_to_pdf(input_path: Path, work_dir: Path, options: dict) -> Path:
    with open(input_path, "rb") as f:
        return _convert("/forms/libreoffice/convert", {"files": (input_path.name, f)}, work_dir)


def html_to_pdf(input_path: Path, work_dir: Path, options: dict) -> Path:
    with open(input_path, "rb") as f:
        # Gotenberg bắt buộc file HTML chính phải tên là index.html.
        return _convert("/forms/chromium/convert/html", {"files": ("index.html", f, "text/html")}, work_dir)


def _convert(endpoint: str, files: dict, work_dir: Path) -> Path:
    r = call_service(
        "Gotenberg", "chuyển sang PDF", "POST", f"{settings().gotenberg_url}{endpoint}", files=files, timeout=300
    )
    if r.status_code >= 400:
        # Gotenberg trả lỗi dạng chữ thường (ví dụ file hỏng LibreOffice không mở được).
        raise ToolError(f"Gotenberg báo lỗi {r.status_code}: {r.text[:200]}")
    output_path = work_dir / "output.pdf"
    output_path.write_bytes(r.content)
    return output_path
