"""Gọi API của Công Cụ File (cửa dành cho worker, header X-Worker-Key)."""

import logging
import time
from collections.abc import Callable
from pathlib import Path

import requests

from congcufile_worker.config import Settings
from congcufile_worker.core.errors import JobTakenBackError
from congcufile_worker.core.models import Job

log = logging.getLogger("worker")


class ApiClient:
    def __init__(self, s: Settings, sleep: Callable[[float], None] = time.sleep):
        self._s = s
        self._sleep = sleep  # test thay bằng hàm không chờ thật
        self._session = requests.Session()
        self._session.headers["X-Worker-Key"] = s.worker_key

    def _url(self, path: str) -> str:
        return f"{self._s.api_url}/api/jobs{path}"

    def next_job(self, types: list[str]) -> Job | None:
        """Hỏi API có job không (chỉ những loại worker này làm được). None = không có việc."""
        r = self._session.get(self._url("/next"), params={"types": ",".join(types)}, timeout=30)
        if r.status_code == 204:
            return None
        r.raise_for_status()
        return Job.from_api(r.json())

    def download_input(self, job: Job, dest: Path) -> None:
        with self._session.get(self._url(f"/{job.id}/input"), timeout=300, stream=True) as r:
            r.raise_for_status()
            with open(dest, "wb") as f:
                for chunk in r.iter_content(1024 * 1024):
                    f.write(chunk)

    def upload_result(self, job: Job, output_path: Path, name: str | None = None) -> None:
        """Gửi file kết quả. Lỗi tạm thời (mạng, API khởi động lại, lỗi 5xx) thì thử lại, chờ 5, 10, 20, 40 giây.

        409 = job đã được giao cho lượt khác: ném JobTakenBackError. 4xx khác: báo lỗi luôn (thử lại cũng vậy).
        name: tên kết quả (cho job dạng đường link, dùng làm tên khi người dùng tải về).
        """
        tries = self._s.upload_tries
        for n in range(1, tries + 1):
            try:
                with open(output_path, "rb") as f:
                    r = self._session.post(
                        self._url(f"/{job.id}/complete"),
                        files={"file": (output_path.name, f)},
                        data={"attempt": job.attempt, **({"name": name} if name else {})},
                        timeout=600,
                    )
            except requests.RequestException as e:
                problem = str(e)
            else:
                if r.status_code == 409:
                    raise JobTakenBackError(r.text)
                if r.status_code < 500:
                    r.raise_for_status()
                    return
                problem = f"API trả lỗi {r.status_code}"

            if n == tries:
                raise RuntimeError(f"Không gửi được kết quả lên API sau {n} lần: {problem}")
            wait = 5 * 2 ** (n - 1)
            log.warning("Gửi kết quả job %s lỗi (%s), thử lại sau %d giây (lần %d/%d)", job.id, problem, wait, n, tries)
            self._sleep(wait)

    def report_failure(self, job: Job, error: str) -> None:
        try:
            r = self._session.post(
                self._url(f"/{job.id}/fail"), json={"error": error[:1000], "attempt": job.attempt}, timeout=30
            )
            if r.status_code == 409:
                log.warning("Job %s đã được giao cho lượt khác, không báo lỗi nữa.", job.id)
        except requests.RequestException as e:
            # Không báo được thì thôi: job hết hạn giữ sau 2 phút, API sẽ tự giao lại.
            log.error("Không báo lỗi lên API được: %s", e)

    def send_heartbeat(self, job: Job) -> bool:
        """Gia hạn giữ job. False = job không còn thuộc lượt này (409), nên thôi gửi.
        Lỗi mạng thì ném requests.RequestException (người gọi tự quyết thử lại).

        Dùng requests.post riêng thay vì Session chung: hàm này chạy ở luồng phụ, mà Session
        không an toàn khi nhiều luồng dùng cùng lúc."""
        r = requests.post(
            self._url(f"/{job.id}/heartbeat"),
            params={"attempt": job.attempt},
            headers={"X-Worker-Key": self._s.worker_key},
            timeout=15,
        )
        return r.status_code != 409
