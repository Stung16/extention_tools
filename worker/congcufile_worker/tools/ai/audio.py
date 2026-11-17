"""Công cụ AI cho âm thanh/video: chép lời, chép lời YouTube, lọc tạp âm, tách giọng hát.

Biến môi trường (đều có giá trị mặc định):
  WHISPER_MODEL    mô hình chép lời. Mặc định: "large-v3-turbo" khi có GPU, "small" khi chạy CPU.
                   Có thể trỏ tới thư mục mô hình PhoWhisper đã đổi sang định dạng CTranslate2.
  WHISPER_DEVICE   "cuda" hoặc "cpu" (mặc định tự chọn)
  WHISPER_COMPUTE  kiểu số: "float16" (GPU), "int8" (CPU) - mặc định tự chọn
  YTDLP_COOKIES    đường dẫn file cookies.txt (xuất từ trình duyệt đã đăng nhập YouTube).
                   Cần khi YouTube chặn với thông báo "Sign in to confirm you're not a bot".
"""

import platform
import re
import stat
import sys
import zipfile
from pathlib import Path

from congcufile_worker.config import settings
from congcufile_worker.core.errors import ToolError
from congcufile_worker.core.process import run_program
from congcufile_worker.tools.ai.common import download_once, log, models_dir
from congcufile_worker.tools.media import ffmpeg as media

# ---------- Chép lời (faster-whisper) ----------

_whisper_cache = {}


def _whisper():
    """Nạp mô hình Whisper (chỉ lần đầu; các job sau dùng lại)."""
    import ctranslate2
    from faster_whisper import WhisperModel

    s = settings()
    device = s.whisper_device or ("cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu")
    name = s.whisper_model or ("large-v3-turbo" if device == "cuda" else "small")
    compute = s.whisper_compute or ("float16" if device == "cuda" else "int8")
    key = (name, device, compute)
    if key not in _whisper_cache:
        log.info("Nạp mô hình chép lời %s trên %s (%s)...", name, device, compute)
        _whisper_cache[key] = WhisperModel(
            name, device=device, compute_type=compute, download_root=str(models_dir() / "whisper")
        )
    return _whisper_cache[key]


def _timestamp(seconds: float) -> str:
    ms = int(round(seconds * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"


def _transcribe_file(audio_path: Path, work_dir: Path, options: dict, name: str = "output") -> Path:
    language = options.get("language", "vi")
    segments, info = _whisper().transcribe(
        str(audio_path),
        language=None if language == "auto" else language,
        vad_filter=True,  # bỏ qua đoạn im lặng: nhanh hơn, ít "bịa chữ" hơn
        beam_size=5,
    )
    segments = list(segments)  # chép lời thật sự chạy ở dòng này
    log.info("Chép lời xong: %d đoạn, ngôn ngữ %s, dài %.0f giây", len(segments), info.language, info.duration)
    if not segments:
        raise ToolError("Không nghe thấy lời nói nào trong file.")

    if options.get("format") == "srt":
        out = work_dir / f"{name}.srt"
        blocks = [
            f"{i}\n{_timestamp(s.start)} --> {_timestamp(s.end)}\n{s.text.strip()}\n" for i, s in enumerate(segments, 1)
        ]
        out.write_text("\n".join(blocks), encoding="utf-8")
    else:
        out = work_dir / f"{name}.txt"
        out.write_text("\n".join(s.text.strip() for s in segments) + "\n", encoding="utf-8")
    return out


def transcribe(input_path: Path, work_dir: Path, options: dict) -> Path:
    # faster-whisper tự đọc được cả file âm thanh lẫn video (lấy phần tiếng).
    return _transcribe_file(input_path, work_dir, options)


MAX_YOUTUBE_SECONDS = 3 * 3600


def transcribe_youtube(input_path, work_dir: Path, options: dict) -> Path:
    import yt_dlp

    url = options["url"]
    ydl_opts = {
        "format": "bestaudio/best",  # chỉ tải phần tiếng, nhanh hơn tải cả video
        "outtmpl": str(work_dir / "audio.%(ext)s"),
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "match_filter": yt_dlp.utils.match_filter_func(f"duration < {MAX_YOUTUBE_SECONDS}"),
    }
    cookies = settings().ytdlp_cookies
    if cookies:
        ydl_opts["cookiefile"] = cookies
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            audio = Path(ydl.prepare_filename(info))
    except yt_dlp.utils.DownloadError as e:
        if "not a bot" in str(e) or "Sign in" in str(e):
            raise ToolError(
                "YouTube đang chặn máy xử lý (đòi đăng nhập). Người quản trị cần cấu hình "
                "cookies cho yt-dlp: xem mục YouTube trong README."
            ) from None
        raise ToolError(f"Không tải được video YouTube: {str(e)[:200]}") from None
    if not audio.exists():
        raise ToolError("Không tải được video (có thể video dài quá 3 giờ, riêng tư hoặc bị chặn).")

    # Đặt tên file kết quả theo tiêu đề video, bỏ ký tự Windows không cho dùng trong tên file.
    title = re.sub(r'[\\/:*?"<>|\r\n]+', " ", info.get("title") or "youtube").strip()[:80] or "youtube"
    return _transcribe_file(audio, work_dir, options, name=title)


# ---------- Lọc tạp âm (DeepFilterNet, bản chương trình độc lập, không cần PyTorch) ----------

DEEP_FILTER_VERSION = "0.5.6"
DEEP_FILTER_FILES = {
    "Windows": f"deep-filter-{DEEP_FILTER_VERSION}-x86_64-pc-windows-msvc.exe",
    "Linux": f"deep-filter-{DEEP_FILTER_VERSION}-x86_64-unknown-linux-musl",
}


def _deep_filter() -> Path:
    name = DEEP_FILTER_FILES.get(platform.system())
    if not name:
        raise ToolError(f"Chưa hỗ trợ lọc tạp âm trên {platform.system()}.")
    url = f"https://github.com/Rikorose/DeepFilterNet/releases/download/v{DEEP_FILTER_VERSION}/{name}"
    exe = download_once(url, models_dir() / "bin" / name)
    if platform.system() != "Windows":
        exe.chmod(exe.stat().st_mode | stat.S_IEXEC)
    return exe


def remove_noise(input_path: Path, work_dir: Path, options: dict) -> Path:
    # DeepFilterNet làm việc với WAV 48 kHz: đổi sang WAV trước, lọc, rồi đổi lại định dạng gốc.
    wav = work_dir / "noisy.wav"
    media.run_ffmpeg("-i", str(input_path), "-vn", "-ac", "1", "-ar", "48000", str(wav))

    out_dir = work_dir / "clean"
    out_dir.mkdir()
    run_program([str(_deep_filter()), "-o", str(out_dir), str(wav)], "Lọc tạp âm (DeepFilterNet)")
    clean = out_dir / wav.name
    if not clean.exists():
        raise ToolError("Lọc tạp âm không tạo ra file kết quả.")

    fmt = input_path.suffix.lower().lstrip(".")
    fmt = fmt if fmt in media.AUDIO_CODECS else "mp3"
    out = work_dir / f"output.{fmt}"
    media.run_ffmpeg("-i", str(clean), *media.AUDIO_CODECS[fmt], str(out))
    return out


# ---------- Tách giọng hát (Demucs) ----------


def separate_vocals(input_path: Path, work_dir: Path, options: dict) -> Path:
    # Đổi sang WAV trước để Demucs đọc được mọi định dạng (m4a, wma...).
    wav = work_dir / "song.wav"
    media.run_ffmpeg("-i", str(input_path), "-vn", "-ac", "2", "-ar", "44100", str(wav))

    out_dir = work_dir / "demucs"
    # Chạy Demucs như một lệnh riêng; nó tự dùng GPU nếu có.
    cmd = [
        sys.executable,
        "-m",
        "demucs",
        "--two-stems",
        "vocals",
        "-n",
        "htdemucs",
        "--mp3",
        "-o",
        str(out_dir),
        str(wav),
    ]
    run_program(cmd, "Tách giọng (Demucs)")
    stems = out_dir / "htdemucs" / wav.stem
    vocals, music = stems / "vocals.mp3", stems / "no_vocals.mp3"
    if not vocals.exists():
        raise ToolError("Tách giọng không tạo ra file kết quả.")

    choice = options.get("output", "both")
    if choice == "vocals":
        return vocals.rename(work_dir / "giong-hat.mp3")
    if choice == "music":
        return music.rename(work_dir / "nhac-nen.mp3")
    out = work_dir / "output.zip"
    with zipfile.ZipFile(out, "w") as z:
        z.write(vocals, "giong-hat.mp3")
        z.write(music, "nhac-nen.mp3")
    return out
