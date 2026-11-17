"""Văn bản sang giọng nói tiếng Việt bằng VieNeu-TTS (gói pip "vieneu", giấy phép Apache-2.0).

Mặc định dùng mô hình v3 Turbo chạy trên CPU bằng ONNX Runtime (không cần PyTorch, không cần GPU).
Biến môi trường:
  VIENEU_PRECISION  "fp32" (mặc định, chất lượng cao nhất) hoặc "int8" (nhanh hơn ~1,6 lần trên CPU hỗ trợ VNNI)
Mô hình tự tải lần đầu (lưu trong models/huggingface).
"""

from pathlib import Path

from congcufile_worker.config import settings
from congcufile_worker.core.errors import ToolError
from congcufile_worker.tools.ai.common import log
from congcufile_worker.tools.media import ffmpeg as media

_tts = None


def _engine():
    global _tts
    if _tts is None:
        from vieneu import Vieneu

        precision = settings().vieneu_precision
        log.info("Nạp VieNeu-TTS (lần đầu sẽ tải mô hình)...")
        _tts = Vieneu(precision=precision) if precision else Vieneu()
    return _tts


def preset_voices() -> list:
    """Danh sách giọng có sẵn: [(tên hiển thị, mã giọng), ...]."""
    return _engine().list_preset_voices()


def text_to_speech(input_path, work_dir: Path, options: dict) -> Path:
    text = options["text"].strip()
    if not text:
        raise ToolError("Chưa có văn bản để đọc.")
    tts = _engine()
    audio = tts.infer(text, voice=options.get("voice") or None)
    wav = work_dir / "giong-doc.wav"
    tts.save(audio, str(wav))
    # Đổi sang MP3 cho nhẹ (WAV 48 kHz rất nặng).
    out = work_dir / "giong-doc.mp3"
    media.run_ffmpeg("-i", str(wav), *media.AUDIO_CODECS["mp3"], str(out))
    return out
