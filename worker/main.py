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
import threading
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
# Trong lúc xử lý, cứ 30 giây báo API "vẫn đang làm" (API giữ job 2 phút mỗi lần gia hạn).
HEARTBEAT_SECONDS = float(os.environ.get("HEARTBEAT_SECONDS", "30"))
# Gửi kết quả lỗi (mất mạng, API đang khởi động lại) thì thử lại, chờ 5, 10, 20, 40 giây.
UPLOAD_TRIES = 5

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


class JobTakenBack(Exception):
    """API không còn giao job này cho mình (quá hạn nên đã trả về hàng chờ cho lượt khác)."""


class Heartbeat:
    """Chạy một luồng phụ, cứ HEARTBEAT_SECONDS giây gửi "tín hiệu sống" cho job đang làm.

    Dùng:  with Heartbeat(job_id, attempt): ...xử lý...
    Worker chết (mất điện, bị tắt) thì luồng này cũng chết theo, API thôi nhận tín hiệu
    và sau 2 phút sẽ giao job cho lượt khác.
    """

    def __init__(self, job_id, attempt):
        self.job_id = job_id
        self.attempt = attempt
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)

    def _run(self):
        while not self._stop.wait(HEARTBEAT_SECONDS):
            try:
                # Không dùng chung Session với luồng chính (requests.Session không an toàn khi dùng nhiều luồng).
                r = requests.post(f"{API_URL}/api/jobs/{self.job_id}/heartbeat",
                                  params={"attempt": self.attempt},
                                  headers={"X-Worker-Key": WORKER_KEY}, timeout=15)
                if r.status_code == 409:
                    log.warning("Job %s đã được giao cho lượt khác, thôi gửi tín hiệu sống.", self.job_id)
                    return
            except requests.RequestException as e:
                # API tạm tắt: cứ thử lại lần sau. Job còn hạn 2 phút nên lỡ vài lần không sao.
                log.warning("Không gửi được tín hiệu sống cho job %s: %s", self.job_id, e)

    def __enter__(self):
        self._thread.start()
        return self

    def __exit__(self, *exc):
        self._stop.set()


def upload_result(job_id, attempt, output_path, name):
    """Gửi file kết quả lên API. Lỗi tạm thời (mạng, API khởi động lại, lỗi 5xx) thì thử lại."""
    for n in range(1, UPLOAD_TRIES + 1):
        try:
            with open(output_path, "rb") as f:
                r = api.post(
                    f"{API_URL}/api/jobs/{job_id}/complete",
                    files={"file": (output_path.name, f)},
                    data={"attempt": attempt, **({"name": name} if name else {})},
                    timeout=600,
                )
        except requests.RequestException as e:
            problem = str(e)
        else:
            if r.status_code == 409:
                raise JobTakenBack(r.text)
            if r.status_code < 500:
                r.raise_for_status()  # lỗi 4xx khác (thiếu file...) thì báo lỗi luôn, thử lại cũng vậy
                return
            problem = f"API trả lỗi {r.status_code}"

        if n == UPLOAD_TRIES:
            raise RuntimeError(f"Không gửi được kết quả lên API sau {n} lần: {problem}")
        wait = 5 * 2 ** (n - 1)
        log.warning("Gửi kết quả job %s lỗi (%s), thử lại sau %d giây (lần %d/%d)",
                    job_id, problem, wait, n, UPLOAD_TRIES)
        time.sleep(wait)


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

        # Job dạng link: tên file kết quả (ví dụ tên video) dùng làm tên khi người dùng tải về.
        upload_result(job_id, job["attempt"], output_path, output_path.name if input_path is None else None)


def safe_for_log(options):
    """Che mật khẩu trước khi ghi log: {"password": "abc"} -> {"password": "***"}."""
    return {k: ("***" if "password" in k.lower() else v) for k, v in options.items()}


def report_failure(job_id, attempt, error):
    try:
        r = api.post(f"{API_URL}/api/jobs/{job_id}/fail",
                     json={"error": str(error)[:1000], "attempt": attempt}, timeout=30)
        if r.status_code == 409:
            log.warning("Job %s đã được giao cho lượt khác, không báo lỗi nữa.", job_id)
    except requests.RequestException as e:
        # Không báo được thì thôi: job hết hạn giữ sau 2 phút, API sẽ tự giao lại.
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

        log.info("Nhận job %s lượt %d (%s, %s, tuỳ chọn %s)", job["id"], job["attempt"],
                 job["type"], job["originalName"], safe_for_log(job.get("options") or {}))
        started = time.time()
        try:
            with Heartbeat(job["id"], job["attempt"]):
                process(job)
            log.info("Xong job %s sau %.1f giây", job["id"], time.time() - started)
        except JobTakenBack:
            log.warning("Bỏ kết quả job %s: job đã được giao cho lượt khác.", job["id"])
        except Exception as e:
            log.exception("Job %s lỗi", job["id"])
            report_failure(job["id"], job["attempt"], e)


if __name__ == "__main__":
    main()
