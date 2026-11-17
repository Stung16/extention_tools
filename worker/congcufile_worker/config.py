"""Cấu hình của worker: MỌI biến môi trường đều đọc ở đây, nơi khác chỉ gọi settings().

Mỗi biến đều có giá trị mặc định để chạy thử ngay trên máy (API ở localhost:5100, mã dev-worker-key).
Danh sách đầy đủ và ý nghĩa: worker/README.md, mục "Cấu hình".
"""

import os
from dataclasses import dataclass
from functools import cache
from pathlib import Path

# Thư mục gốc của dự án (chứa worker/, api/, models/...).
PROJECT_ROOT = Path(__file__).resolve().parents[2]


def _text(name: str, default: str) -> str:
    return os.environ.get(name) or default


def _optional(name: str) -> str | None:
    """Biến không bắt buộc: không đặt hoặc để trống thì là None."""
    return os.environ.get(name) or None


@dataclass(frozen=True)
class Settings:
    # ----- Kết nối API -----
    api_url: str  # API_URL         địa chỉ API
    worker_key: str  # WORKER_KEY      mã bí mật giữa API và worker
    profile: str  # WORKER_PROFILE  main | ai | photo | all
    poll_seconds: float  # (cố định 3)     không có việc thì chờ bao lâu rồi hỏi lại
    heartbeat_seconds: float  # HEARTBEAT_SECONDS  khoảng cách giữa hai lần gửi tín hiệu sống
    upload_tries: int  # (cố định 5)     số lần thử gửi kết quả khi mạng/API lỗi

    # ----- Dịch vụ PDF, video -----
    gotenberg_url: str  # GOTENBERG_URL
    stirling_url: str  # STIRLING_URL
    stirling_api_key: str | None  # STIRLING_API_KEY (chỉ cần khi bật lại đăng nhập Stirling-PDF)
    ffmpeg: str  # FFMPEG          đường dẫn ffmpeg (mặc định tìm trong PATH)

    # ----- AI -----
    models_dir: Path  # MODELS_DIR      nơi lưu mô hình tải về (mặc định models/ ở gốc dự án)
    ai_device: str | None  # AI_DEVICE       ép "cpu" hoặc "cuda" cho PyTorch
    whisper_device: str | None  # WHISPER_DEVICE
    whisper_model: str | None  # WHISPER_MODEL   mặc định large-v3-turbo (GPU) / small (CPU)
    whisper_compute: str | None  # WHISPER_COMPUTE
    ytdlp_cookies: str | None  # YTDLP_COOKIES   file cookies YouTube
    ollama_url: str  # OLLAMA_URL
    ollama_model: str  # OLLAMA_MODEL
    acestep_url: str  # ACESTEP_URL     máy chủ tạo nhạc ACE-Step
    acestep_api_key: str | None  # ACESTEP_API_KEY
    pdf2zh_bin: str | None  # PDF2ZH_BIN      chương trình dịch PDF giữ bố cục
    vieneu_precision: str | None  # VIENEU_PRECISION  fp32 | int8

    # ----- Ảnh RAW -----
    rawtherapee_cli: str | None  # RAWTHERAPEE_CLI
    exiftool: str | None  # EXIFTOOL

    @classmethod
    def from_environment(cls) -> "Settings":
        return cls(
            api_url=_text("API_URL", "http://localhost:5100").rstrip("/"),
            worker_key=_text("WORKER_KEY", "dev-worker-key"),
            profile=_text("WORKER_PROFILE", "main"),
            poll_seconds=3,
            heartbeat_seconds=float(_text("HEARTBEAT_SECONDS", "30")),
            upload_tries=5,
            gotenberg_url=_text("GOTENBERG_URL", "http://localhost:3000").rstrip("/"),
            stirling_url=_text("STIRLING_URL", "http://localhost:8080").rstrip("/"),
            stirling_api_key=_optional("STIRLING_API_KEY"),
            ffmpeg=_text("FFMPEG", "ffmpeg"),
            models_dir=Path(_text("MODELS_DIR", str(PROJECT_ROOT / "models"))),
            ai_device=_optional("AI_DEVICE"),
            whisper_device=_optional("WHISPER_DEVICE"),
            whisper_model=_optional("WHISPER_MODEL"),
            whisper_compute=_optional("WHISPER_COMPUTE"),
            ytdlp_cookies=_optional("YTDLP_COOKIES"),
            ollama_url=_text("OLLAMA_URL", "http://localhost:11434").rstrip("/"),
            ollama_model=_text("OLLAMA_MODEL", "qwen2.5:7b"),
            acestep_url=_text("ACESTEP_URL", "http://localhost:8001").rstrip("/"),
            acestep_api_key=_optional("ACESTEP_API_KEY"),
            pdf2zh_bin=_optional("PDF2ZH_BIN"),
            vieneu_precision=_optional("VIENEU_PRECISION"),
            rawtherapee_cli=_optional("RAWTHERAPEE_CLI"),
            exiftool=_optional("EXIFTOOL"),
        )


@cache
def settings() -> Settings:
    """Cấu hình hiện tại (đọc một lần). Test đổi biến môi trường rồi gọi settings.cache_clear()."""
    return Settings.from_environment()


def prepare_model_cache(s: Settings) -> None:
    """Cho thư viện AI (Hugging Face, PyTorch) lưu mô hình vào models/ của dự án thay vì thư mục người dùng
    trên ổ C. Phải gọi TRƯỚC khi nạp thư viện AI."""
    os.environ.setdefault("HF_HOME", str(s.models_dir / "huggingface"))
    os.environ.setdefault("TORCH_HOME", str(s.models_dir / "torch"))
