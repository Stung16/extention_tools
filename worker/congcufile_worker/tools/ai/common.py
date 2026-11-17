"""Hàm dùng chung cho các công cụ AI: thư mục mô hình, tải file mô hình, chọn CPU/GPU."""

import logging
import urllib.request
from pathlib import Path

from congcufile_worker.config import settings

log = logging.getLogger("worker")


def models_dir() -> Path:
    """Thư mục lưu mô hình AI (mặc định models/ ở gốc dự án, không đưa lên Git)."""
    path = settings().models_dir
    path.mkdir(parents=True, exist_ok=True)
    return path


def download_once(url: str, dest: Path) -> Path:
    """Tải file về dest nếu chưa có. Lần đầu dùng công cụ sẽ chậm hơn vì phải tải."""
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    log.info("Đang tải %s (chỉ lần đầu)...", url)
    tmp = dest.with_suffix(dest.suffix + ".part")
    urllib.request.urlretrieve(url, tmp)
    tmp.replace(dest)
    return dest


def torch_device() -> str:
    """'cuda' nếu có GPU NVIDIA dùng được, không thì 'cpu'. Đặt AI_DEVICE=cpu để ép chạy CPU."""
    forced = settings().ai_device
    if forced:
        return forced
    import torch

    return "cuda" if torch.cuda.is_available() else "cpu"
