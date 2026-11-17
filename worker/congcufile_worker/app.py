"""Điểm khởi động worker: đọc cấu hình, chọn bộ công cụ theo WORKER_PROFILE, chạy vòng lặp."""

import logging
import sys

from congcufile_worker.config import prepare_model_cache, settings
from congcufile_worker.core.api_client import ApiClient
from congcufile_worker.core.runner import JobRunner


def main() -> None:
    # Windows mặc định không ghi log bằng UTF-8, chữ tiếng Việt sẽ bị lỗi. Ép dùng UTF-8.
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    s = settings()
    prepare_model_cache(s)  # phải trước khi nạp thư viện AI (registry nạp lười theo profile)

    from congcufile_worker.registry import handlers_for

    JobRunner(ApiClient(s), handlers_for(s.profile), s).run_forever()
