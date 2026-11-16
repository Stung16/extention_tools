"""Danh sách handler: mỗi loại job ứng với một hàm xử lý.

Mỗi handler nhận (input_path, work_dir, options) và trả về đường dẫn file kết quả.
options là dict các tuỳ chọn người dùng chọn, ví dụ {"level": "5"} (có thể rỗng).
Thêm công cụ mới = viết thêm một hàm trong thư mục này và đăng ký ở đây
(nhớ khai báo thêm loại job trong biến jobTypes ở api/Program.cs).
Nhiều loại job có thể dùng chung một handler.
"""

from . import compress_pdf, html_to_pdf, office_to_pdf, stirling_to_pdf

HANDLERS = {
    # Đổi sang PDF qua Gotenberg
    "word-to-pdf": office_to_pdf.run,
    "excel-to-pdf": office_to_pdf.run,
    "powerpoint-to-pdf": office_to_pdf.run,
    "html-to-pdf": html_to_pdf.run,
    # Đổi sang PDF qua Stirling-PDF
    "image-to-pdf": stirling_to_pdf.image,
    "markdown-to-pdf": stirling_to_pdf.markdown,
    "ebook-to-pdf": stirling_to_pdf.ebook,
    "email-to-pdf": stirling_to_pdf.email,
    "comic-to-pdf": stirling_to_pdf.comic,
    "svg-to-pdf": stirling_to_pdf.svg,
    "postscript-to-pdf": stirling_to_pdf.postscript,
    # Công cụ PDF khác
    "compress-pdf": compress_pdf.run,
}
