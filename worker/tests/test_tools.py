"""Các công cụ: danh sách khớp với API, ảnh, video, ảnh RAW."""

import re
import shutil
import subprocess

import pytest
from PIL import Image

from congcufile_worker.config import PROJECT_ROOT
from congcufile_worker.core.errors import ToolError
from congcufile_worker.registry import ai_handlers, handlers_for, main_handlers, photo_handlers
from congcufile_worker.tools.image import images
from congcufile_worker.tools.media import ffmpeg
from congcufile_worker.tools.pdf import gotenberg, stirling
from congcufile_worker.tools.photo import raw_develop

CATALOG = PROJECT_ROOT / "api" / "src" / "CongCuFile.Domain" / "Catalog" / "JobCatalog.cs"


def catalog_types_by_worker() -> dict[str, set[str]]:
    """Đọc danh mục công cụ của API (JobCatalog.cs): loại job -> nhóm worker ("main" nếu không ghi)."""
    text = CATALOG.read_text(encoding="utf-8")
    entries = list(re.finditer(r'\["([a-z0-9-]+)"\] = new\(', text))
    groups: dict[str, set[str]] = {}
    for i, m in enumerate(entries):
        body = text[m.end() : entries[i + 1].start() if i + 1 < len(entries) else len(text)]
        worker = re.search(r'Worker: "(\w+)"', body)
        groups.setdefault(worker.group(1) if worker else "main", set()).add(m.group(1))
    return groups


# ---------- Danh sách công cụ ----------


def test_each_api_job_type_has_a_handler_in_the_right_worker():
    catalog = catalog_types_by_worker()
    assert set(main_handlers()) == catalog["main"]
    assert set(ai_handlers()) == catalog["ai"]
    assert set(photo_handlers()) == catalog["photo"]


def test_profiles():
    assert set(handlers_for("all")) == set(main_handlers()) | set(ai_handlers()) | set(photo_handlers())
    with pytest.raises(ValueError, match="WORKER_PROFILE"):
        handlers_for("khong-co")


# ---------- Ảnh ----------


def _photo(path, size=(1200, 900)):
    image = Image.new("RGB", size)
    for x in range(0, size[0], 40):  # vẽ sọc màu để ảnh có nội dung thật
        image.paste((x % 255, 80, 255 - x % 255), (x, 0, x + 20, size[1]))
    image.save(path)
    return path


def test_compress_jpg_is_smaller(tmp_path):
    src = _photo(tmp_path / "anh.jpg")
    Image.open(src).save(src, quality=100)
    out = images.compress(src, tmp_path, {"level": "strong"})
    assert out.suffix == ".jpg"
    assert out.stat().st_size < src.stat().st_size


def test_compress_never_returns_bigger_file(tmp_path):
    src = tmp_path / "nho.png"
    Image.new("RGB", (8, 8), "white").save(src, optimize=True)
    out = images.compress(src, tmp_path, {"level": "light"})
    assert out.stat().st_size <= src.stat().st_size


@pytest.mark.parametrize("fmt", ["jpg", "png", "webp", "pdf"])
def test_convert_image(tmp_path, fmt):
    out = images.convert(_photo(tmp_path / "anh.png", (100, 80)), tmp_path, {"format": fmt})
    assert out.suffix == f".{fmt}"
    assert out.stat().st_size > 0


def test_convert_unknown_format(tmp_path):
    with pytest.raises(ToolError, match="Không hỗ trợ"):
        images.convert(_photo(tmp_path / "anh.png", (10, 10)), tmp_path, {"format": "bmp"})


# ---------- Video (cần FFmpeg; máy không có thì bỏ qua) ----------

needs_ffmpeg = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="máy không có FFmpeg")


def test_trim_rejects_end_before_start(tmp_path):
    with pytest.raises(ToolError, match="kết thúc phải sau"):
        ffmpeg.trim_video(tmp_path / "v.mp4", tmp_path, {"start": "5", "end": "2"})


@needs_ffmpeg
def test_trim_and_audio(tmp_path, env):
    env()
    video = tmp_path / "thu.mp4"
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=size=320x240:rate=25",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440",
            "-t",
            "3",
            "-c:v",
            "libx264",
            "-c:a",
            "aac",
            "-shortest",
            str(video),
        ],
        check=True,
    )
    trimmed = ffmpeg.trim_video(video, tmp_path, {"start": "0.5", "end": "2"})
    assert trimmed.stat().st_size > 0
    mp3 = ffmpeg.video_to_mp3(video, tmp_path, {})
    assert mp3.suffix == ".mp3" and mp3.stat().st_size > 0


@needs_ffmpeg
def test_ffmpeg_error_is_reported(tmp_path, env):
    env()
    bad = tmp_path / "hong.mp4"
    bad.write_bytes(b"khong phai video")
    with pytest.raises(ToolError, match="^FFmpeg báo lỗi"):
        ffmpeg.convert_audio(bad, tmp_path, {"format": "mp3"})


# ---------- Ảnh RAW ----------


def test_raw_develop_reports_missing_rawtherapee(tmp_path, env):
    env(RAWTHERAPEE_CLI=str(tmp_path / "khong-co" / "rawtherapee-cli.exe"))
    with pytest.raises(ToolError, match="RAWTHERAPEE_CLI trỏ tới"):
        raw_develop.develop(tmp_path / "anh.arw", tmp_path, {})


def test_raw_develop_rejects_unknown_preset(tmp_path):
    with pytest.raises(ToolError, match="Kiểu rửa"):
        raw_develop.develop(tmp_path / "anh.arw", tmp_path, {"preset": "lam-dep"})


def test_metadata_command_copies_raw_metadata_and_keeps_color_profile(tmp_path):
    cmd = raw_develop.metadata_command("exiftool", tmp_path / "a.arw", tmp_path / "a.jpg")
    # Xoá metadata phần mềm tự ghi trước, rồi chép nguyên metadata gốc của file RAW.
    assert cmd.index("-all=") < cmd.index("-TagsFromFile")
    assert cmd[cmd.index("-TagsFromFile") + 1] == str(tmp_path / "a.arw")
    assert "--ICC_Profile:all" in cmd and "--Orientation" in cmd


def test_profiles_exist_for_every_preset():
    for _base, overlay in raw_develop.PRESETS.values():
        assert (raw_develop.PROFILES_DIR / overlay).is_file()


# ---------- Dịch vụ PDF tắt ----------


def test_pdf_tools_report_offline_service_in_vietnamese(tmp_path, env):
    import socket

    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        closed = f"http://127.0.0.1:{sock.getsockname()[1]}"
    env(STIRLING_URL=closed, GOTENBERG_URL=closed)
    src = tmp_path / "a.pdf"
    src.write_bytes(b"%PDF-1.4")
    with pytest.raises(ToolError, match=r"Stirling-PDF\) đang tắt"):
        stirling.post("/api/v1/misc/compress-pdf", src, tmp_path)
    doc = tmp_path / "a.docx"
    doc.write_bytes(b"x")
    with pytest.raises(ToolError, match=r"Gotenberg\) đang tắt"):
        gotenberg.office_to_pdf(doc, tmp_path, {})
