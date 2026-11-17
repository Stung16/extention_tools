"""Tín hiệu sống: trong lúc xử lý, cứ vài chục giây báo API "vẫn đang làm job này" để gia hạn giữ job."""

import logging
import threading

import requests

from congcufile_worker.core.api_client import ApiClient
from congcufile_worker.core.models import Job

log = logging.getLogger("worker")


class Heartbeat:
    """Chạy một luồng phụ gửi tín hiệu sống. Dùng:  with Heartbeat(api, job, 30): ...xử lý...

    Worker chết (mất điện, bị tắt) thì luồng này chết theo, API thôi nhận tín hiệu và sau 2 phút
    sẽ giao job cho lượt khác.
    """

    def __init__(self, api: ApiClient, job: Job, interval_seconds: float):
        self._api = api
        self._job = job
        self._interval = interval_seconds
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)

    def _run(self) -> None:
        while not self._stop.wait(self._interval):
            try:
                if not self._api.send_heartbeat(self._job):
                    log.warning("Job %s đã được giao cho lượt khác, thôi gửi tín hiệu sống.", self._job.id)
                    return
            except requests.RequestException as e:
                # API tạm tắt: cứ thử lại lần sau. Job còn hạn 2 phút nên lỡ vài lần không sao.
                log.warning("Không gửi được tín hiệu sống cho job %s: %s", self._job.id, e)

    def __enter__(self) -> "Heartbeat":
        self._thread.start()
        return self

    def __exit__(self, *exc) -> None:
        self._stop.set()
