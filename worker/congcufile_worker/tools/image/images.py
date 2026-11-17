"""Công cụ ảnh bằng Pillow: nén ảnh, đổi định dạng ảnh, đổi HEIC/AVIF sang JPG.

Pillow đọc được JPG, PNG, WebP, GIF, BMP, TIFF, AVIF; thêm pillow-heif để đọc HEIC (ảnh iPhone).
"""

import shutil
from pathlib import Path

import pillow_heif
from PIL import Image, ImageOps

from congcufile_worker.core.errors import ToolError

pillow_heif.register_heif_opener()

# Chất lượng JPG/WebP và cạnh dài tối đa cho từng mức nén.
# Ảnh điện thoại thường 4000px trở lên; thu về 2560/1920px là đủ xem trên mọi màn hình.
QUALITY = {"light": 85, "medium": 72, "strong": 55}
MAX_SIDE = {"light": None, "medium": 2560, "strong": 1920}


def open_image(path: Path) -> Image.Image:
    im = Image.open(path)
    # Ảnh chụp điện thoại lưu hướng xoay trong EXIF: xoay ảnh thật cho đúng chiều trước khi xử lý.
    return ImageOps.exif_transpose(im)


def to_rgb(im: Image.Image) -> Image.Image:
    """JPG không có nền trong suốt: đặt ảnh lên nền trắng."""
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        background = Image.new("RGB", im.size, "white")
        background.paste(im, mask=im.getchannel("A"))
        return background
    return im.convert("RGB")


def to_jpg(input_path: Path, work_dir: Path) -> Path:
    """Đổi ảnh bất kỳ (HEIC, AVIF...) sang JPG chất lượng cao. Dùng cho các công cụ khác."""
    out = work_dir / (input_path.stem + "-converted.jpg")
    to_rgb(open_image(input_path)).save(out, "JPEG", quality=92)
    return out


def compress(input_path: Path, work_dir: Path, options: dict) -> Path:
    level = options.get("level", "medium")
    im = open_image(input_path)

    max_side = MAX_SIDE.get(level)
    if max_side and max(im.size) > max_side:
        im.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)

    ext = input_path.suffix.lower()
    if ext == ".png":
        out = work_dir / "output.png"
        if level == "strong":
            # Giảm còn 256 màu: file nhỏ hơn nhiều, hợp với ảnh chụp màn hình, logo.
            im = im.convert("RGBA").quantize(colors=256, method=Image.Quantize.FASTOCTREE)
        im.save(out, "PNG", optimize=True)
    elif ext == ".webp":
        out = work_dir / "output.webp"
        im.save(out, "WEBP", quality=QUALITY[level], method=6)
    else:
        # JPG, và cả HEIC/AVIF (đổi sang JPG cho mọi máy đều mở được).
        out = work_dir / "output.jpg"
        to_rgb(im).save(out, "JPEG", quality=QUALITY[level], optimize=True, progressive=True)

    # Nén xong mà còn to hơn ảnh gốc cùng định dạng thì trả lại ảnh gốc.
    if out.suffix == ext and out.stat().st_size >= input_path.stat().st_size:
        shutil.copyfile(input_path, out)
    return out


def convert(input_path: Path, work_dir: Path, options: dict) -> Path:
    fmt = options.get("format", "jpg")
    im = open_image(input_path)  # ảnh động (GIF) thì lấy khung hình đầu

    if fmt == "jpg":
        out = work_dir / "output.jpg"
        to_rgb(im).save(out, "JPEG", quality=92)
    elif fmt == "png":
        out = work_dir / "output.png"
        im.save(out, "PNG", optimize=True)
    elif fmt == "webp":
        out = work_dir / "output.webp"
        im.save(out, "WEBP", quality=90, method=6)
    elif fmt == "pdf":
        out = work_dir / "output.pdf"
        to_rgb(im).save(out, "PDF", resolution=150)
    else:
        raise ToolError(f"Không hỗ trợ đổi sang '{fmt}'")
    return out
