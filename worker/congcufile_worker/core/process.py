"""Chạy chương trình ngoài (FFmpeg, RawTherapee, ExifTool, xpstopdf...) theo một cách thống nhất.

Mọi công cụ gọi chương trình ngoài đều dùng run_program: thiếu chương trình hay chương trình báo lỗi
thì đều thành ToolError với câu tiếng Việt giống nhau.
"""

import glob
import os
import shutil
import subprocess
from pathlib import Path

from congcufile_worker.core.errors import ToolError


def find_program(
    configured: str | None, names: list[str], fallbacks: list[str] | None = None, setting_name: str | None = None
) -> str:
    """Tìm đường dẫn một chương trình.

    configured  đường dẫn đặt trong cấu hình (ưu tiên nhất); đặt mà không có file thì báo lỗi ngay
    names       tên lệnh để tìm trong PATH, ví dụ ["exiftool"]
    fallbacks   mẫu đường dẫn hay gặp, ví dụ r"C:\\Program Files\\RawTherapee\\*\\rawtherapee-cli.exe"
    setting_name tên biến môi trường tương ứng, để câu lỗi chỉ đúng chỗ cần sửa
    """
    if configured:
        if Path(configured).is_file():
            return configured
        raise ToolError(f"{setting_name or 'Cấu hình'} trỏ tới '{configured}' nhưng không có file đó.")
    for name in names:
        found = shutil.which(name)
        if found:
            return found
    for pattern in fallbacks or []:
        matches = sorted(glob.glob(pattern), reverse=True)  # bản mới nhất trước
        if matches:
            return matches[0]
    hint = f" Cài rồi thêm vào PATH, hoặc đặt biến môi trường {setting_name}." if setting_name else ""
    raise ToolError(f"Máy xử lý chưa cài {names[0]}.{hint}")


def run_program(
    cmd: list[str],
    name: str,
    install_hint: str | None = None,
    timeout: float | None = None,
    cwd: Path | None = None,
    env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess:
    """Chạy cmd và chờ xong. Lỗi thì ném ToolError kèm 3 dòng cuối mà chương trình in ra.

    name          tên hiển thị trong câu lỗi, ví dụ "FFmpeg"
    install_hint  gợi ý cài khi máy chưa có chương trình, ví dụ "gói libgxps-utils"
    """
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            cwd=cwd,
            # Chương trình con là Python (pdf2zh, Demucs...) thì in bằng UTF-8, khớp với cách đọc ở trên
            # (trên Windows mặc định là cp1252, chữ có dấu sẽ bị hỏng).
            env={**os.environ, "PYTHONIOENCODING": "utf-8", **(env or {})},
        )
    except FileNotFoundError:
        hint = f" ({install_hint})" if install_hint else ""
        raise ToolError(f"Máy xử lý chưa cài {name}{hint}.") from None
    except subprocess.TimeoutExpired:
        raise ToolError(f"{name} chạy quá lâu (hơn {int(timeout or 0)} giây) nên đã dừng.") from None

    if result.returncode != 0:
        lines = (result.stderr or result.stdout or "").strip().splitlines()[-3:]
        raise ToolError(f"{name} báo lỗi: " + (" | ".join(lines) if lines else f"mã {result.returncode}"))
    return result
