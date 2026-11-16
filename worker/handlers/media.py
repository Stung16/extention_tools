"""Công cụ video và âm thanh bằng FFmpeg: nén, đổi định dạng, tách MP3, cắt đoạn.

FFmpeg là chương trình dòng lệnh; worker gọi nó như khi bạn gõ lệnh trong terminal.
Đường dẫn tới ffmpeg đặt bằng biến môi trường FFMPEG (mặc định "ffmpeg" trong PATH).
"""

import os
import shutil
import subprocess
from pathlib import Path

FFMPEG = os.environ.get("FFMPEG", "ffmpeg")


def run_ffmpeg(*args: str) -> None:
    cmd = [FFMPEG, "-hide_banner", "-loglevel", "error", "-y", *args]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    except FileNotFoundError:
        raise RuntimeError("Không tìm thấy FFmpeg trên máy xử lý. Cài FFmpeg hoặc đặt biến FFMPEG.") from None
    if result.returncode != 0:
        detail = (result.stderr or "").strip().splitlines()[-3:]
        raise RuntimeError("FFmpeg báo lỗi: " + " | ".join(detail) if detail else "FFmpeg báo lỗi.")


# Thiết lập video H.264 + âm thanh AAC: mở được trên mọi điện thoại, máy tính, trình duyệt.
# yuv420p và kích thước chẵn là điều kiện để mọi máy phát được.
H264 = ["-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart"]
EVEN = "scale=trunc(iw/2)*2:trunc(ih/2)*2"


def _limit_short_side(px: int) -> str:
    """Bộ lọc thu nhỏ để cạnh ngắn tối đa px (giữ tỉ lệ, áp dụng cả video dọc lẫn ngang)."""
    return f"scale='if(gt(iw,ih),-2,min({px},iw))':'if(gt(iw,ih),min({px},ih),-2)'"


def compress_video(input_path: Path, work_dir: Path, options: dict) -> Path:
    level = options.get("level", "medium")
    # CRF: số càng lớn, file càng nhỏ, hình càng kém. 23 gần như không thấy khác, 32 hơi mờ.
    crf, video_filter = {
        "light": ("24", EVEN),
        "medium": ("28", _limit_short_side(1080)),
        "strong": ("32", _limit_short_side(720)),
    }[level]
    out = work_dir / "output.mp4"
    run_ffmpeg("-i", str(input_path), "-vf", video_filter, *H264, "-crf", crf, str(out))

    # Video gốc đã là MP4 và nhỏ hơn bản nén thì trả lại bản gốc.
    if input_path.suffix.lower() == ".mp4" and out.stat().st_size >= input_path.stat().st_size:
        shutil.copyfile(input_path, out)
    return out


def convert_video(input_path: Path, work_dir: Path, options: dict) -> Path:
    fmt = options.get("format", "mp4")
    out = work_dir / f"output.{fmt}"
    if fmt in ("mp4", "mov"):
        run_ffmpeg("-i", str(input_path), "-vf", EVEN, *H264, "-crf", "22", str(out))
    elif fmt == "webm":
        # VP9 + Opus. "realtime" và cpu-used 8 cho nhanh, đổi lại file to hơn chút.
        run_ffmpeg("-i", str(input_path), "-c:v", "libvpx-vp9", "-crf", "33", "-b:v", "0",
                   "-deadline", "realtime", "-cpu-used", "8", "-c:a", "libopus", "-b:a", "128k", str(out))
    elif fmt == "mkv":
        # MKV chứa được hầu hết mọi loại hình/tiếng: chép nguyên luồng, không mã hoá lại nên rất nhanh.
        run_ffmpeg("-i", str(input_path), "-map", "0", "-c", "copy", str(out))
    else:
        raise ValueError(f"Không hỗ trợ đổi sang '{fmt}'")
    return out


AUDIO_CODECS = {
    "mp3": ["-c:a", "libmp3lame", "-q:a", "2"],  # khoảng 190 kbps, chất lượng tốt
    "wav": ["-c:a", "pcm_s16le"],
    "m4a": ["-c:a", "aac", "-b:a", "192k"],
    "flac": ["-c:a", "flac"],
    "ogg": ["-c:a", "libvorbis", "-q:a", "5"],
}


def convert_audio(input_path: Path, work_dir: Path, options: dict) -> Path:
    fmt = options.get("format", "mp3")
    out = work_dir / f"output.{fmt}"
    run_ffmpeg("-i", str(input_path), "-vn", *AUDIO_CODECS[fmt], str(out))
    return out


def video_to_mp3(input_path: Path, work_dir: Path, options: dict) -> Path:
    out = work_dir / "output.mp3"
    run_ffmpeg("-i", str(input_path), "-vn", *AUDIO_CODECS["mp3"], str(out))
    return out


def trim_video(input_path: Path, work_dir: Path, options: dict) -> Path:
    start, end = float(options["start"]), float(options["end"])
    if end <= start:
        raise ValueError("Thời điểm kết thúc phải sau thời điểm bắt đầu.")
    out = work_dir / "output.mp4"
    # Mã hoá lại (không chép nguyên luồng) để cắt đúng tới từng khung hình.
    run_ffmpeg("-ss", f"{start:.3f}", "-i", str(input_path), "-t", f"{end - start:.3f}",
               "-vf", EVEN, *H264, "-crf", "20", str(out))
    return out
