"""Danh sách handler: mỗi loại job ứng với một hàm xử lý.

Mỗi handler nhận (input_path, work_dir) và trả về đường dẫn file kết quả.
Thêm công cụ mới = viết thêm một file trong thư mục này và đăng ký ở đây
(nhớ khai báo thêm loại job trong biến jobTypes ở api/Program.cs).
"""

from . import compress_pdf, word_to_pdf

HANDLERS = {
    "word-to-pdf": word_to_pdf.run,
    "compress-pdf": compress_pdf.run,
}
