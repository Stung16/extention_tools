"""Danh sách công cụ: mỗi loại job ứng với một hàm xử lý (handler).

Thêm công cụ mới = viết một hàm (input_path, work_dir, options) -> Path trong tools/<nhóm>/ rồi thêm một dòng
ở đây (và khai báo loại job trong api/src/CongCuFile.Domain/Catalog/JobCatalog.cs). Nhiều loại job có thể
dùng chung một hàm.

Ba nhóm, ứng với WORKER_PROFILE:
  main   chạy được trên máy thường (Stirling-PDF, Gotenberg, Pillow, FFmpeg)
  ai     cần thư viện AI nặng (PyTorch...), nên chạy trên máy có GPU
  photo  xử lý ảnh RAW cho nhiếp ảnh gia (RawTherapee + ExifTool, không AI)
  all    cả ba
Nhóm ai và photo chỉ được nạp khi cần, để worker main không phải cài PyTorch.
"""

from congcufile_worker.core.models import Handler


def main_handlers() -> dict[str, Handler]:
    from congcufile_worker.tools.image import images
    from congcufile_worker.tools.media import ffmpeg
    from congcufile_worker.tools.pdf import compress, converters, edit, from_pdf, gotenberg, to_pdf

    return {
        # Đổi sang PDF qua Gotenberg
        "word-to-pdf": gotenberg.office_to_pdf,
        "excel-to-pdf": gotenberg.office_to_pdf,
        "powerpoint-to-pdf": gotenberg.office_to_pdf,
        "html-to-pdf": gotenberg.html_to_pdf,
        # Đổi sang PDF qua Stirling-PDF
        "image-to-pdf": to_pdf.image,
        "markdown-to-pdf": to_pdf.markdown,
        "ebook-to-pdf": to_pdf.ebook,
        "email-to-pdf": to_pdf.email,
        "comic-to-pdf": to_pdf.comic,
        "svg-to-pdf": to_pdf.svg,
        "postscript-to-pdf": to_pdf.postscript,
        # Đổi sang PDF bằng chương trình riêng (xpstopdf, ddjvu) hoặc thư viện ezdxf
        "xps-to-pdf": converters.xps_to_pdf,
        "djvu-to-pdf": converters.djvu_to_pdf,
        "dxf-to-pdf": converters.dxf_to_pdf,
        # Đổi từ PDF qua Stirling-PDF
        "pdf-to-word": from_pdf.word,
        "pdf-to-excel": from_pdf.excel,
        "pdf-to-powerpoint": from_pdf.powerpoint,
        "pdf-to-jpg": from_pdf.jpg,
        "pdf-to-png": from_pdf.png,
        "pdf-to-text": from_pdf.text,
        "pdf-to-html": from_pdf.html,
        "pdf-to-epub": from_pdf.epub,
        # Chỉnh sửa PDF qua Stirling-PDF
        "compress-pdf": compress.compress_pdf,
        "rotate-pdf": edit.rotate,
        "remove-pages": edit.remove_pages,
        "extract-pages": edit.extract_pages,
        "protect-pdf": edit.protect,
        "unlock-pdf": edit.unlock,
        "watermark-pdf": edit.watermark,
        "page-numbers-pdf": edit.page_numbers,
        "ocr-pdf": edit.ocr,
        # Ảnh (Pillow)
        "compress-image": images.compress,
        "convert-image": images.convert,
        "image-to-text": converters.image_to_text,
        # Video, âm thanh (FFmpeg)
        "compress-video": ffmpeg.compress_video,
        "convert-video": ffmpeg.convert_video,
        "convert-audio": ffmpeg.convert_audio,
        "video-to-mp3": ffmpeg.video_to_mp3,
        "trim-video": ffmpeg.trim_video,
    }


def ai_handlers() -> dict[str, Handler]:
    from congcufile_worker.tools.ai import audio, image, music, speech, text

    return {
        "text-to-speech": speech.text_to_speech,
        "generate-music": music.generate,
        "translate-pdf": text.translate_pdf,
        "transcribe-audio": audio.transcribe,
        "transcribe-video": audio.transcribe,
        "transcribe-youtube": audio.transcribe_youtube,
        "noise-remove": audio.remove_noise,
        "vocal-remove": audio.separate_vocals,
        "enhance-image": image.enhance,
        "summarize-document": text.summarize,
        "translate-document": text.translate,
    }


def photo_handlers() -> dict[str, Handler]:
    from congcufile_worker.tools.photo import raw_develop

    return {
        "raw-develop": raw_develop.develop,
    }


PROFILES = {
    "main": [main_handlers],
    "ai": [ai_handlers],
    "photo": [photo_handlers],
    "all": [main_handlers, ai_handlers, photo_handlers],
}


def handlers_for(profile: str) -> dict[str, Handler]:
    """Bộ công cụ của một loại worker ("main", "ai", "photo" hoặc "all")."""
    if profile not in PROFILES:
        raise ValueError(f"WORKER_PROFILE không hợp lệ: '{profile}' (chọn {', '.join(PROFILES)})")
    handlers: dict[str, Handler] = {}
    for group in PROFILES[profile]:
        handlers.update(group())
    return handlers
