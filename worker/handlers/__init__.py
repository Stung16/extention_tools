"""Danh sách handler: mỗi loại job ứng với một hàm xử lý.

Mỗi handler nhận (input_path, work_dir, options) và trả về đường dẫn file kết quả.
  input_path  file người dùng tải lên (None nếu là job dạng đường link, khi đó link ở options["url"])
  options     dict các tuỳ chọn người dùng chọn, ví dụ {"level": "5"} (có thể rỗng)
Thêm công cụ mới = viết thêm một hàm trong thư mục này và đăng ký ở đây
(nhớ khai báo thêm loại job trong api/JobCatalog.cs). Nhiều loại job có thể dùng chung một handler.

Có ba nhóm:
  MAIN   chạy được trên máy thường (Stirling-PDF, Gotenberg, Pillow, FFmpeg)
  AI     cần thư viện AI nặng (PyTorch...), nên chạy trên máy có GPU; chỉ được nạp khi worker là "ai"/"all"
  PHOTO  xử lý ảnh RAW cho nhiếp ảnh gia (RawTherapee + ExifTool, không AI); nạp khi worker là "photo"/"all"
"""

from . import (compress_pdf, converters, html_to_pdf, images, media, office_to_pdf, stirling_from_pdf,
               stirling_pdf_tools, stirling_to_pdf)

MAIN = {
    # Đổi sang PDF qua Gotenberg
    "word-to-pdf": office_to_pdf.run,
    "excel-to-pdf": office_to_pdf.run,
    "powerpoint-to-pdf": office_to_pdf.run,
    "html-to-pdf": html_to_pdf.run,
    # Đổi sang PDF qua Stirling-PDF
    "image-to-pdf": stirling_to_pdf.image,
    "markdown-to-pdf": stirling_to_pdf.markdown,
    "ebook-to-pdf": stirling_to_pdf.ebook,
    "email-to-pdf": stirling_to_pdf.email,
    "comic-to-pdf": stirling_to_pdf.comic,
    "svg-to-pdf": stirling_to_pdf.svg,
    "postscript-to-pdf": stirling_to_pdf.postscript,
    # Đổi sang PDF bằng chương trình riêng (xpstopdf, ddjvu) hoặc thư viện ezdxf
    "xps-to-pdf": converters.xps_to_pdf,
    "djvu-to-pdf": converters.djvu_to_pdf,
    "dxf-to-pdf": converters.dxf_to_pdf,
    # Đổi từ PDF qua Stirling-PDF
    "pdf-to-word": stirling_from_pdf.word,
    "pdf-to-excel": stirling_from_pdf.excel,
    "pdf-to-powerpoint": stirling_from_pdf.powerpoint,
    "pdf-to-jpg": stirling_from_pdf.jpg,
    "pdf-to-png": stirling_from_pdf.png,
    "pdf-to-text": stirling_from_pdf.text,
    "pdf-to-html": stirling_from_pdf.html,
    "pdf-to-epub": stirling_from_pdf.epub,
    # Chỉnh sửa PDF qua Stirling-PDF
    "compress-pdf": compress_pdf.run,
    "rotate-pdf": stirling_pdf_tools.rotate,
    "remove-pages": stirling_pdf_tools.remove_pages,
    "extract-pages": stirling_pdf_tools.extract_pages,
    "protect-pdf": stirling_pdf_tools.protect,
    "unlock-pdf": stirling_pdf_tools.unlock,
    "watermark-pdf": stirling_pdf_tools.watermark,
    "page-numbers-pdf": stirling_pdf_tools.page_numbers,
    "ocr-pdf": stirling_pdf_tools.ocr,
    # Ảnh (Pillow)
    "compress-image": images.compress,
    "convert-image": images.convert,
    "image-to-text": converters.image_to_text,
    # Video, âm thanh (FFmpeg)
    "compress-video": media.compress_video,
    "convert-video": media.convert_video,
    "convert-audio": media.convert_audio,
    "video-to-mp3": media.video_to_mp3,
    "trim-video": media.trim_video,
}


def _ai_handlers() -> dict:
    # Nạp ở đây (không nạp ở đầu file) để worker thường không cần cài PyTorch.
    from . import ai_audio, ai_image, ai_music, ai_speech, ai_text

    return {
        "text-to-speech": ai_speech.text_to_speech,
        "generate-music": ai_music.generate,
        "translate-pdf": ai_text.translate_pdf,
        "transcribe-audio": ai_audio.transcribe,
        "transcribe-video": ai_audio.transcribe,
        "transcribe-youtube": ai_audio.transcribe_youtube,
        "noise-remove": ai_audio.remove_noise,
        "vocal-remove": ai_audio.separate_vocals,
        "enhance-image": ai_image.enhance,
        "summarize-document": ai_text.summarize,
        "translate-document": ai_text.translate,
    }


def _photo_handlers() -> dict:
    from . import photo

    return {
        "raw-develop": photo.develop,
    }


def handlers_for(profile: str) -> dict:
    """profile: "main", "ai", "photo" hoặc "all"."""
    if profile == "main":
        return dict(MAIN)
    if profile == "ai":
        return _ai_handlers()
    if profile == "photo":
        return _photo_handlers()
    if profile == "all":
        return {**MAIN, **_ai_handlers(), **_photo_handlers()}
    raise ValueError(f"WORKER_PROFILE không hợp lệ: '{profile}' (chọn main, ai, photo hoặc all)")
