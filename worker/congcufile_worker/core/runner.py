"""Vòng lặp chính: hỏi API lấy việc, xử lý trong thư mục tạm, gửi kết quả hoặc báo lỗi."""

import logging
import tempfile
import time
from collections.abc import Callable
from pathlib import Path

import requests

from congcufile_worker.config import Settings
from congcufile_worker.core.api_client import ApiClient
from congcufile_worker.core.errors import JobTakenBackError
from congcufile_worker.core.heartbeat import Heartbeat
from congcufile_worker.core.models import Handler, Job

log = logging.getLogger("worker")


class JobRunner:
    def __init__(
        self, api: ApiClient, handlers: dict[str, Handler], s: Settings, sleep: Callable[[float], None] = time.sleep
    ):
        self._api = api
        self._handlers = handlers
        self._s = s
        self._sleep = sleep

    def run_forever(self) -> None:
        log.info(
            "Worker '%s' bắt đầu. API: %s. Nhận %d loại job: %s",
            self._s.profile,
            self._s.api_url,
            len(self._handlers),
            ", ".join(self._handlers),
        )
        while True:
            if not self.run_once():
                self._sleep(self._s.poll_seconds)

    def run_once(self) -> bool:
        """Hỏi và xử lý tối đa một job. False = không có việc (hoặc không gọi được API)."""
        try:
            job = self._api.next_job(list(self._handlers))
        except requests.RequestException as e:
            # API tắt hoặc mất mạng: không dừng worker, đợi rồi hỏi lại.
            log.warning("Không gọi được API: %s", e)
            return False
        if job is None:
            return False

        log.info(
            "Nhận job %s lượt %d (%s, %s, tuỳ chọn %s)",
            job.id,
            job.attempt,
            job.type,
            job.original_name,
            job.options_for_log(),
        )
        started = time.time()
        try:
            with Heartbeat(self._api, job, self._s.heartbeat_seconds):
                self._process(job)
            log.info("Xong job %s sau %.1f giây", job.id, time.time() - started)
        except JobTakenBackError:
            log.warning("Bỏ kết quả job %s: job đã được giao cho lượt khác.", job.id)
        except Exception as e:  # noqa: BLE001 - mọi lỗi của công cụ đều phải báo lên API, không làm sập worker
            log.exception("Job %s lỗi", job.id)
            self._api.report_failure(job, str(e))
        return True

    def _process(self, job: Job) -> None:
        handler = self._handlers.get(job.type)
        if handler is None:
            raise ValueError(f"Worker chưa có công cụ cho loại job '{job.type}'")

        # Thư mục tạm: tự xoá khi xử lý xong.
        with tempfile.TemporaryDirectory() as tmp:
            work_dir = Path(tmp)
            input_path = None
            if job.has_input_file:
                # Tên file do mình đặt, chỉ giữ đuôi (.docx...) từ tên người dùng gửi.
                input_path = work_dir / ("input" + Path(job.original_name).suffix.lower())
                self._api.download_input(job, input_path)

            output_path = handler(input_path, work_dir, job.options)

            # Job dạng đường link: tên file kết quả (ví dụ tên video) dùng làm tên khi người dùng tải về.
            self._api.upload_result(job, output_path, name=output_path.name if input_path is None else None)
