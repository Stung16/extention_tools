"""Các loại lỗi của worker."""


class ToolError(RuntimeError):
    """Lỗi công cụ báo cho người dùng (câu tiếng Việt dễ hiểu), ví dụ "Sai mật khẩu PDF".

    Công cụ ném ToolError khi biết rõ chuyện gì sai; câu lỗi được gửi nguyên văn lên API
    và hiện trên trang web. Lỗi bất ngờ khác cũng được báo lên, nhưng câu chữ là của Python.
    """


class JobTakenBackError(Exception):
    """API không còn giao job này cho mình (quá hạn nên đã trả về hàng chờ cho lượt khác):
    bỏ kết quả, không báo lỗi."""
