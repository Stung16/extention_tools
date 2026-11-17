"""Phần lõi: cấu hình, gọi API, vòng lặp xử lý, chạy chương trình ngoài."""

import sys
from pathlib import Path

import pytest

from congcufile_worker.config import PROJECT_ROOT, settings
from congcufile_worker.core.api_client import ApiClient
from congcufile_worker.core.errors import JobTakenBackError, ToolError
from congcufile_worker.core.models import Job
from congcufile_worker.core.process import find_program, run_program
from congcufile_worker.core.runner import JobRunner

JOB = Job(id="job-1", type="compress-image", original_name="anh.png", input="file", attempt=2)


# ---------- Cấu hình ----------


def test_settings_defaults(env, monkeypatch):
    for name in ("API_URL", "WORKER_KEY", "WORKER_PROFILE", "MODELS_DIR", "STIRLING_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    env()
    s = settings()
    assert s.api_url == "http://localhost:5100"
    assert s.worker_key == "dev-worker-key"
    assert s.profile == "main"
    assert s.models_dir == PROJECT_ROOT / "models"
    assert s.stirling_api_key is None


def test_settings_from_environment(env):
    env(API_URL="http://may-chu:8080/", WORKER_PROFILE="photo", HEARTBEAT_SECONDS="5", STIRLING_API_KEY="")
    s = settings()
    assert s.api_url == "http://may-chu:8080"  # bỏ dấu / cuối
    assert s.profile == "photo"
    assert s.heartbeat_seconds == 5
    assert s.stirling_api_key is None  # để trống cũng như không đặt


def test_job_from_api_and_password_hidden_in_log():
    job = Job.from_api(
        {
            "id": "x",
            "type": "protect-pdf",
            "originalName": "a.pdf",
            "input": "file",
            "attempt": 1,
            "options": {"password": "bi-mat"},
        }
    )
    assert job.has_input_file
    assert job.options_for_log() == {"password": "***"}
    assert not Job.from_api({"id": "y", "type": "t", "attempt": 1, "input": "url"}).has_input_file


# ---------- Gọi API ----------


def test_next_job_returns_none_when_no_work(fake_api):
    fake_api.replies[("GET", "/api/jobs/next")] = [(204, None)]
    assert ApiClient(settings()).next_job(["compress-image"]) is None


def test_next_job_parses_job(fake_api):
    fake_api.replies[("GET", "/api/jobs/next")] = [
        (
            200,
            {
                "id": "j",
                "type": "compress-image",
                "originalName": "a.png",
                "input": "file",
                "attempt": 1,
                "options": {},
            },
        )
    ]
    job = ApiClient(settings()).next_job(["compress-image", "convert-image"])
    assert job.id == "j"
    assert "types=compress-image%2Cconvert-image" in fake_api.requests[0][1]


def test_upload_retries_server_errors(fake_api, tmp_path):
    out = tmp_path / "kq.png"
    out.write_bytes(b"png")
    fake_api.replies[("POST", "/api/jobs/job-1/complete")] = [(503, None), (503, None), (200, None)]
    waits = []
    ApiClient(settings(), sleep=waits.append).upload_result(JOB, out)
    assert waits == [5, 10]  # chờ 5 rồi 10 giây giữa các lần
    assert len(fake_api.calls("POST", "/api/jobs/job-1/complete")) == 3


def test_upload_409_means_job_taken_back(fake_api, tmp_path):
    out = tmp_path / "kq.png"
    out.write_bytes(b"png")
    fake_api.replies[("POST", "/api/jobs/job-1/complete")] = [(409, {"error": "lượt khác"})]
    with pytest.raises(JobTakenBackError):
        ApiClient(settings(), sleep=lambda _: None).upload_result(JOB, out)
    assert len(fake_api.calls("POST", "/api/jobs/job-1/complete")) == 1


def test_upload_400_fails_without_retry(fake_api, tmp_path):
    out = tmp_path / "kq.png"
    out.write_bytes(b"png")
    fake_api.replies[("POST", "/api/jobs/job-1/complete")] = [(400, {"error": "thiếu file"})]
    with pytest.raises(Exception, match="400"):
        ApiClient(settings(), sleep=lambda _: None).upload_result(JOB, out)
    assert len(fake_api.calls("POST", "/api/jobs/job-1/complete")) == 1


def test_upload_sends_attempt_number(fake_api, tmp_path):
    out = tmp_path / "kq.png"
    out.write_bytes(b"png")
    fake_api.replies[("POST", "/api/jobs/job-1/complete")] = [(200, None)]
    ApiClient(settings()).upload_result(JOB, out)
    body = fake_api.calls("POST", "/api/jobs/job-1/complete")[0]
    assert b'name="attempt"\r\n\r\n2' in body


def test_heartbeat_409_stops(fake_api):
    fake_api.replies[("POST", "/api/jobs/job-1/heartbeat")] = [(409, {"error": "x"})]
    assert ApiClient(settings()).send_heartbeat(JOB) is False
    fake_api.replies[("POST", "/api/jobs/job-1/heartbeat")] = [(200, None)]
    assert ApiClient(settings()).send_heartbeat(JOB) is True


# ---------- Vòng lặp xử lý ----------


class RecordingApi:
    """API giả ở mức Python: ghi lại worker đã gọi gì."""

    def __init__(self, job, upload_error=None):
        self.job, self.upload_error = job, upload_error
        self.uploaded, self.failures = [], []

    def next_job(self, types):
        job, self.job = self.job, None
        return job

    def download_input(self, job, dest: Path):
        dest.write_bytes(b"input")

    def upload_result(self, job, output_path, name=None):
        if self.upload_error:
            raise self.upload_error
        self.uploaded.append((job.id, output_path.read_bytes(), name))

    def report_failure(self, job, error):
        self.failures.append((job.id, error))

    def send_heartbeat(self, job):
        return True


def _runner(api, handler):
    return JobRunner(api, {"compress-image": handler}, settings(), sleep=lambda _: None)


def test_runner_success_uploads_result(env):
    env()

    def handler(input_path, work_dir, options):
        assert input_path.name == "input.png" and input_path.read_bytes() == b"input"
        out = work_dir / "output.png"
        out.write_bytes(b"done")
        return out

    api = RecordingApi(JOB)
    assert _runner(api, handler).run_once() is True
    assert api.uploaded == [("job-1", b"done", None)]
    assert api.failures == []


def test_runner_reports_tool_error_message(env):
    env()

    def handler(input_path, work_dir, options):
        raise ToolError("Sai mật khẩu PDF.")

    api = RecordingApi(JOB)
    _runner(api, handler).run_once()
    assert api.failures == [("job-1", "Sai mật khẩu PDF.")]


def test_runner_drops_result_when_job_taken_back(env, tmp_path):
    env()

    def handler(input_path, work_dir, options):
        out = work_dir / "o.png"
        out.write_bytes(b"x")
        return out

    api = RecordingApi(JOB, upload_error=JobTakenBackError("409"))
    _runner(api, handler).run_once()
    assert api.failures == []  # không báo lỗi: job đã thuộc lượt khác


def test_runner_link_job_has_no_input_and_sends_name(env):
    env()
    job = Job(id="j2", type="compress-image", original_name="ket-qua", input="url", attempt=1, options={"url": "u"})

    def handler(input_path, work_dir, options):
        assert input_path is None
        out = work_dir / "Tên video.txt"
        out.write_text("lời", encoding="utf-8")
        return out

    api = RecordingApi(job)
    _runner(api, handler).run_once()
    assert api.uploaded[0][2] == "Tên video.txt"


def test_runner_returns_false_when_no_work(env):
    env()
    assert _runner(RecordingApi(None), lambda *a: None).run_once() is False


# ---------- Chạy chương trình ngoài ----------


def test_run_program_success():
    result = run_program([sys.executable, "-c", "print('xin chào')"], "Python")
    assert "xin chào" in result.stdout


def test_run_program_error_shows_last_lines():
    with pytest.raises(ToolError, match=r"^Python báo lỗi: .*dòng 3"):
        run_program(
            [sys.executable, "-c", "import sys; sys.stderr.write('dòng 1\\ndòng 2\\ndòng 3\\n'); sys.exit(2)"], "Python"
        )


def test_run_program_missing_program():
    with pytest.raises(ToolError, match=r"chưa cài khong-co \(gói thử\)"):
        run_program(["chuong-trinh-khong-ton-tai-123"], "khong-co", "gói thử")


def test_run_program_timeout():
    with pytest.raises(ToolError, match="chạy quá lâu"):
        run_program([sys.executable, "-c", "import time; time.sleep(5)"], "Python", timeout=0.5)


def test_find_program_configured_missing_file():
    with pytest.raises(ToolError, match="EXIFTOOL trỏ tới"):
        find_program("C:/khong/co/exiftool.exe", ["exiftool"], setting_name="EXIFTOOL")


def test_find_program_uses_fallback_pattern(tmp_path):
    for version in ("5.10", "5.11"):
        (tmp_path / version).mkdir()
        (tmp_path / version / "tool.exe").write_text("")
    found = find_program(None, ["chuong-trinh-khong-ton-tai-123"], [str(tmp_path / "*" / "tool.exe")])
    assert Path(found).parent.name == "5.11"  # bản mới nhất
