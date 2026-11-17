"""Gọi các dịch vụ phụ qua HTTP (Stirling-PDF, Gotenberg, Ollama, ACE-Step...).

Dịch vụ tắt hoặc không trả lời thì requests ném lỗi tiếng Anh kỹ thuật ("HTTPConnectionPool... refused").
call_service() đổi những lỗi đó thành ToolError có câu tiếng Việt, để người dùng thấy câu dễ hiểu
và người quản lý (app giám sát) biết ngay dịch vụ nào cần bật.
"""

import requests

from congcufile_worker.core.errors import ToolError


def call_service(name: str, purpose: str, method: str, url: str, **kwargs) -> requests.Response:
    """Gửi request tới dịch vụ `name` (ví dụ "Stirling-PDF"), dùng để `purpose` (ví dụ "xử lý PDF").

    kwargs chuyển nguyên cho requests (files, data, json, headers, timeout...).
    Trả về Response (kể cả mã lỗi 4xx/5xx: nơi gọi tự đọc câu lỗi của dịch vụ).
    """
    try:
        return requests.request(method, url, **kwargs)
    except requests.ConnectTimeout:
        raise ToolError(_offline(name, purpose)) from None
    except requests.Timeout:
        raise ToolError(f"Dịch vụ {purpose} ({name}) chạy quá lâu không xong. Vui lòng thử lại sau.") from None
    except requests.ConnectionError:
        raise ToolError(_offline(name, purpose)) from None


def _offline(name: str, purpose: str) -> str:
    return f"Dịch vụ {purpose} ({name}) đang tắt nên chưa xử lý được file. Vui lòng thử lại sau."
