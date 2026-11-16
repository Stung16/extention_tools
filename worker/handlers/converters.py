"""Thêm vài công cụ đổi định dạng: ảnh sang chữ (OCR), XPS, DjVu, bản vẽ DXF sang PDF.

  XPS  -> PDF: chương trình xpstopdf (gói libgxps-utils, LGPL)
  DjVu -> PDF: chương trình ddjvu (gói djvulibre-bin, GPL)
  DXF  -> PDF: thư viện Python ezdxf (MIT) vẽ bằng matplotlib
Hai chương trình đầu có sẵn trong image Docker của worker; chạy tay trên Windows thì phải tự cài.
"""

import shutil
import subprocess
from pathlib import Path

from . import images, stirling


def _run(program: str, args: list[str], install_hint: str) -> None:
    exe = shutil.which(program)
    if not exe:
        raise RuntimeError(f"Máy xử lý chưa cài {program} ({install_hint}). Bản chạy bằng Docker đã có sẵn.")
    result = subprocess.run([exe, *args], capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode != 0:
        raise RuntimeError(f"{program} báo lỗi: " + (result.stderr or result.stdout).strip()[-300:])


def xps_to_pdf(input_path: Path, work_dir: Path, options: dict) -> Path:
    out = work_dir / "output.pdf"
    _run("xpstopdf", [str(input_path), str(out)], "gói libgxps-utils")
    return out


def djvu_to_pdf(input_path: Path, work_dir: Path, options: dict) -> Path:
    out = work_dir / "output.pdf"
    _run("ddjvu", ["-format=pdf", "-quality=85", str(input_path), str(out)], "gói djvulibre-bin")
    return out


def dxf_to_pdf(input_path: Path, work_dir: Path, options: dict) -> Path:
    import matplotlib

    matplotlib.use("Agg")  # vẽ ra file, không mở cửa sổ
    from ezdxf import recover
    from ezdxf.addons.drawing import matplotlib as dxf_draw

    try:
        # recover: đọc được cả file DXF hơi lỗi (hay gặp khi xuất từ phần mềm khác)
        doc, _auditor = recover.readfile(str(input_path))
    except Exception as e:
        raise ValueError(f"Không đọc được file DXF: {e}") from None
    out = work_dir / "output.pdf"
    dxf_draw.qsave(doc.modelspace(), str(out), bg="#FFFFFF", dpi=300)
    return out


def image_to_text(input_path: Path, work_dir: Path, options: dict) -> Path:
    """Ảnh -> PDF -> OCR (tiếng Việt + Anh) -> chữ (.txt) hoặc PDF có chữ."""
    if input_path.suffix.lower() in (".heic", ".heif", ".avif"):
        input_path = images.to_jpg(input_path, work_dir)

    scanned = stirling.post("/api/v1/convert/img/pdf", input_path, work_dir, {
        "fitOption": "fitDocumentToImage", "colorType": "color", "autoRotate": "false",
    }).rename(work_dir / "scanned.pdf")
    ocr = stirling.post("/api/v1/misc/ocr-pdf", scanned, work_dir, {
        "languages": ["vie", "eng"],
        "ocrType": "force-ocr",
        "ocrRenderType": "hocr",
        "deskew": "true",
    }).rename(work_dir / "ocr.pdf")
    if options.get("format") == "pdf":
        return ocr
    text = stirling.post("/api/v1/convert/pdf/text", ocr, work_dir, {"outputFormat": "txt"}, expect=".txt")
    if not text.read_text(encoding="utf-8", errors="replace").strip():
        raise RuntimeError("Không nhận ra chữ nào trong ảnh (ảnh mờ, quá nhỏ, hoặc không có chữ).")
    return text
