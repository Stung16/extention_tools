"""Kiểu dữ liệu dùng chung."""

from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

# Một công cụ (handler): nhận (file đầu vào, thư mục làm việc tạm, tuỳ chọn) và trả về đường dẫn file kết quả.
#   input_path  file người dùng tải lên; None nếu là job dạng đường link (link ở options["url"]) hoặc chỉ nhập chữ
#   work_dir    thư mục tạm riêng cho job này, tự xoá khi xong
#   options     các tuỳ chọn đã được API kiểm tra, ví dụ {"level": "medium"}
Handler = Callable[[Path | None, Path, dict[str, str]], Path]


@dataclass(frozen=True)
class Job:
    """Một job API giao cho worker (dựng từ JSON của GET /api/jobs/next)."""

    id: str
    type: str
    original_name: str
    input: str  # "file" | "url" | "none"
    attempt: int
    options: dict[str, str] = field(default_factory=dict)

    @classmethod
    def from_api(cls, data: dict) -> "Job":
        return cls(
            id=data["id"],
            type=data["type"],
            original_name=data.get("originalName") or "",
            input=data.get("input") or "file",
            attempt=int(data["attempt"]),
            options=data.get("options") or {},
        )

    @property
    def has_input_file(self) -> bool:
        return self.input not in ("url", "none")

    def options_for_log(self) -> dict[str, str]:
        """Che mật khẩu trước khi ghi log: {"password": "abc"} -> {"password": "***"}."""
        return {k: ("***" if "password" in k.lower() else v) for k, v in self.options.items()}
