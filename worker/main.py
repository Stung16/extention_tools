"""Worker: cứ vài giây hỏi API xem có job không, có thì xử lý rồi gửi kết quả lên.

Chạy:  python main.py
Cấu hình qua biến môi trường (có giá trị mặc định để chạy thử trên máy):
  WORKER_PROFILE  loại worker: "main" (PDF, ảnh, video...), "ai" (chép lời, tách giọng...), "all" (cả hai)
                  (mặc định main)
  API_URL         địa chỉ API          (mặc định http://localhost:5100)
  WORKER_KEY      mã bí mật của worker (mặc định dev-worker-key, phải trùng với API)
  GOTENBERG_URL   địa chỉ Gotenberg    (mặc định http://localhost:3000)
  STIRLING_URL    địa chỉ Stirling-PDF (mặc định http://localhost:8080)
  MODELS_DIR      nơi lưu mô hình AI tải về (mặc định thư mục models/ của dự án)
Các biến riêng cho worker AI: xem handlers/ai_*.py.
"""

import logging
import os
import sys
import tempfile
import time
from pathlib import Path

# Mô hình AI tải về được lưu trong thư mục models/ của dự án (không đưa lên Git),
# thay vì thư mục người dùng trên ổ C. Phải đặt TRƯỚC khi nạp thư viện AI.
MODELS_DIR = Path(os.environ.get("MODELS_DIR", Path(__file__).resolve().parent.parent / "models"))
os.environ.setdefault("HF_HOME", str(MODELS_DIR / "huggingface"))
os.environ.setdefault("TORCH_HOME", str(MODELS_DIR / "torch"))

import requests  # noqa: E402

from handlers import handlers_for  # noqa: E402

API_URL = os.environ.get("API_URL", "http://localhost:5100").rstrip("/")
WORKER_KEY = os.environ.get("WORKER_KEY", "dev-worker-key")
PROFILE = os.environ.get("WORKER_PROFILE", "main")
POLL_SECONDS = 3

# Windows mặc định không ghi log bằng UTF-8, chữ tiếng Việt sẽ bị lỗi. Ép dùng UTF-8.
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("worker")

HANDLERS = handlers_for(PROFILE)

# Session giữ header X-Worker-Key cho mọi lần gọi API.
api = requests.Session()
api.headers["X-Worker-Key"] = WORKER_KEY


def fetch_next_job():
    """Hỏi API có job không (chỉ những loại worker này làm được). Trả về job (dict) hoặc None."""
    r = api.get(f"{API_URL}/api/jobs/next", params={"types": ",".join(HANDLERS)}, timeout=30)
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

        if job.get("input") in ("url", "none"):
            # Job dạng đường link (link nằm trong options["url"]) hoặc chỉ nhập chữ (đọc văn bản, tạo nhạc):
            # không có file đầu vào.
            input_path = None
        else:
            # Đặt tên file do mình chọn, chỉ giữ đuôi file (.docx...) từ tên người dùng gửi.
            input_path = work_dir / ("input" + Path(job["originalName"]).suffix.lower())
            with api.get(f"{API_URL}/api/jobs/{job_id}/input", timeout=300, stream=True) as r:
                r.raise_for_status()
                with open(input_path, "wb") as f:
                    for chunk in r.iter_content(1024 * 1024):
                        f.write(chunk)

        output_path = handler(input_path, work_dir, job.get("options") or {})

        with open(output_path, "rb") as f:
            r = api.post(
                f"{API_URL}/api/jobs/{job_id}/complete",
                files={"file": (output_path.name, f)},
                # Job dạng link: tên file kết quả (ví dụ tên video) dùng làm tên khi người dùng tải về.
                data={"name": output_path.name} if input_path is None else None,
                timeout=600,
            )
        r.raise_for_status()


def safe_for_log(options):
    """Che mật khẩu trước khi ghi log: {"password": "abc"} -> {"password": "***"}."""
    return {k: ("***" if "password" in k.lower() else v) for k, v in options.items()}


def report_failure(job_id, error):
    try:
        api.post(f"{API_URL}/api/jobs/{job_id}/fail", json={"error": str(error)[:1000]}, timeout=30)
    except requests.RequestException as e:
        log.error("Không báo lỗi lên API được: %s", e)


def main():
    log.info("Worker '%s' bắt đầu. API: %s. Nhận %d loại job: %s",
             PROFILE, API_URL, len(HANDLERS), ", ".join(HANDLERS))
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
                 job["id"], job["type"], job["originalName"], safe_for_log(job.get("options") or {}))
        started = time.time()
        try:
            process(job)
            log.info("Xong job %s sau %.1f giây", job["id"], time.time() - started)
        except Exception as e:
            log.exception("Job %s lỗi", job["id"])
            report_failure(job["id"], e)


if __name__ == "__main__":
    main()
