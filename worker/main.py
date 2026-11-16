"""Worker: cứ vài giây hỏi API xem có job không, có thì xử lý rồi gửi kết quả lên.

Chạy:  python main.py
Cấu hình qua biến môi trường (có giá trị mặc định để chạy thử trên máy):
  API_URL        địa chỉ API          (mặc định http://localhost:5100)
  WORKER_KEY     mã bí mật của worker (mặc định dev-worker-key, phải trùng với API)
  GOTENBERG_URL  địa chỉ Gotenberg    (mặc định http://localhost:3000)
"""

import logging
import os
import sys
import tempfile
import time
from pathlib import Path

import requests

from handlers import HANDLERS

API_URL = os.environ.get("API_URL", "http://localhost:5100").rstrip("/")
WORKER_KEY = os.environ.get("WORKER_KEY", "dev-worker-key")
POLL_SECONDS = 3

# Windows mặc định không ghi log bằng UTF-8, chữ tiếng Việt sẽ bị lỗi. Ép dùng UTF-8.
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("worker")

# Session giữ header X-Worker-Key cho mọi lần gọi API.
api = requests.Session()
api.headers["X-Worker-Key"] = WORKER_KEY


def fetch_next_job():
    """Hỏi API có job không. Trả về job (dict) hoặc None."""
    r = api.get(f"{API_URL}/api/jobs/next", timeout=30)
    if r.status_code == 204:
        return None
    r.raise_for_status()
    return r.json()


def process(job):
    job_id = job["id"]
    handler = HANDLERS.get(job["type"])
    if handler is None:
        raise ValueError(f"Worker chưa có handler cho loại job '{job['type']}'")

    # Thư mục tạm: tự xoá khi xử lý xong.
    with tempfile.TemporaryDirectory() as tmp:
        work_dir = Path(tmp)

        # Đặt tên file do mình chọn, chỉ giữ đuôi file (.docx...) từ tên người dùng gửi.
        input_path = work_dir / ("input" + Path(job["originalName"]).suffix.lower())
        r = api.get(f"{API_URL}/api/jobs/{job_id}/input", timeout=300)
        r.raise_for_status()
        input_path.write_bytes(r.content)

        output_path = handler(input_path, work_dir, job.get("options") or {})

        with open(output_path, "rb") as f:
            r = api.post(
                f"{API_URL}/api/jobs/{job_id}/complete",
                files={"file": (output_path.name, f)},
                timeout=300,
            )
        r.raise_for_status()


def report_failure(job_id, error):
    try:
        api.post(f"{API_URL}/api/jobs/{job_id}/fail", json={"error": str(error)[:1000]}, timeout=30)
    except requests.RequestException as e:
        log.error("Không báo lỗi lên API được: %s", e)


def main():
    log.info("Worker bắt đầu. API: %s. Handler: %s", API_URL, ", ".join(HANDLERS))
    while True:
        try:
            job = fetch_next_job()
        except requests.RequestException as e:
            # API tắt hoặc mất mạng: không dừng worker, đợi rồi hỏi lại.
            log.warning("Không gọi được API: %s", e)
            time.sleep(POLL_SECONDS)
            continue

        if job is None:
            time.sleep(POLL_SECONDS)
            continue

        log.info("Nhận job %s (%s, %s, tuỳ chọn %s)",
                 job["id"], job["type"], job["originalName"], job.get("options") or {})
        started = time.time()
        try:
            process(job)
            log.info("Xong job %s sau %.1f giây", job["id"], time.time() - started)
        except Exception as e:
            log.exception("Job %s lỗi", job["id"])
            report_failure(job["id"], e)


if __name__ == "__main__":
    main()
