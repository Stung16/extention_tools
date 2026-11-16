"""Rửa ảnh RAW trung thực, KHÔNG dùng AI: RawTherapee (bản dòng lệnh) + ExifTool.

Mọi bước đều là thuật toán cổ điển, không vẽ thêm chi tiết:
  - làm nét bằng khử nhoè quang học (capture sharpening, deconvolution): đảo ngược phần nhoè do ống kính;
  - sửa lỗi ống kính tự động theo cơ sở dữ liệu lensfun (méo hình, tối góc);
  - khử nhiễu (preset "Ảnh tối, ISO cao");
  - cân bằng trắng theo máy chụp.
Sau đó ExifTool xoá hết thông tin RawTherapee tự ghi vào ảnh (trừ hồ sơ màu ICC) rồi chép NGUYÊN metadata
gốc từ file RAW sang (máy, ống kính, ngày chụp, bản quyền...). Không thêm thẻ nào nhắc tới phần mềm hay AI.

Cấu hình (biến môi trường):
  RAWTHERAPEE_CLI  đường dẫn rawtherapee-cli (mặc định: tìm trong PATH, rồi C:\\Program Files\\RawTherapee\\*)
  EXIFTOOL         đường dẫn exiftool       (mặc định: tìm trong PATH, rồi C:\\Tools\\exiftool)
"""

import glob
import os
import shutil
import subprocess
from pathlib import Path

PROFILES_DIR = Path(__file__).resolve().parent / "photo_profiles"

# Mỗi kiểu rửa = một profile có sẵn của RawTherapee làm nền + một profile bổ sung của mình (photo_profiles/).
PRESETS = {
    "natural": ("Auto-Matched Curve - ISO Low.pp3", "natural.pp3"),
    "high-iso": ("Auto-Matched Curve - ISO High.pp3", "high-iso.pp3"),
}


def _find_program(env_name: str, names: list[str], fallbacks: list[str]) -> str:
    configured = os.environ.get(env_name)
    if configured:
        if Path(configured).is_file():
            return configured
        raise RuntimeError(f"{env_name} trỏ tới '{configured}' nhưng không có file đó.")
    for name in names:
        found = shutil.which(name)
        if found:
            return found
    for pattern in fallbacks:
        matches = sorted(glob.glob(pattern), reverse=True)  # bản mới nhất trước
        if matches:
            return matches[0]
    raise RuntimeError(
        f"Máy xử lý chưa cài {names[0]}. Cài rồi thêm vào PATH, hoặc đặt biến môi trường {env_name}."
    )


def rawtherapee_cli() -> str:
    return _find_program(
        "RAWTHERAPEE_CLI",
        ["rawtherapee-cli"],
        [r"C:\Program Files\RawTherapee\*\rawtherapee-cli.exe", r"C:\Program Files\RawTherapee\rawtherapee-cli.exe"],
    )


def exiftool() -> str:
    return _find_program(
        "EXIFTOOL", ["exiftool"], [r"C:\Tools\exiftool\exiftool.exe", r"C:\Tools\exiftool*\exiftool.exe"]
    )


def bundled_profile(cli: str, name: str) -> Path:
    """Profile có sẵn đi kèm RawTherapee (Windows: cạnh file .exe; Linux: /usr/share/rawtherapee)."""
    for root in (Path(cli).parent / "profiles", Path("/usr/share/rawtherapee/profiles")):
        candidate = root / name
        if candidate.is_file():
            return candidate
    raise RuntimeError(f"Không tìm thấy profile có sẵn '{name}' của RawTherapee.")


def _run(cmd: list[str], what: str, timeout: int = 900) -> None:
    result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip().splitlines()[-3:]
        raise RuntimeError(f"{what} báo lỗi: {' | '.join(detail) or f'mã {result.returncode}'}")


def copy_metadata(raw: Path, out: Path) -> None:
    """Xoá metadata RawTherapee ghi (giữ ICC) rồi chép nguyên metadata của file RAW sang ảnh kết quả."""
    _run(
        [
            exiftool(), "-overwrite_original", "-m",
            # Xoá hết những gì RawTherapee tự ghi (Software, XMP...), trừ hồ sơ màu.
            "-all=", "--ICC_Profile:all",
            # Chép lại toàn bộ thông tin gốc từ file RAW.
            "-TagsFromFile", str(raw), "-all:all", "-unsafe",
            # Trừ: hướng xoay (ảnh đã được xoay thật), ảnh xem trước/ảnh nhỏ nhúng trong RAW, hồ sơ màu.
            "--Orientation", "--ICC_Profile:all", "--PreviewImage", "--ThumbnailImage", "--JpgFromRaw",
            "--OtherImage", "--PreviewTIFF", "--ThumbnailTIFF",
            str(out),
        ],
        "ExifTool",
    )


def develop(input_path: Path, work_dir: Path, options: dict) -> Path:
    """Rửa một ảnh RAW. options: preset (natural | high-iso), format (jpg | tif)."""
    preset = options.get("preset", "natural")
    fmt = options.get("format", "jpg")
    if preset not in PRESETS:
        raise ValueError(f"Kiểu rửa không hợp lệ: {preset}")

    cli = rawtherapee_cli()
    base_name, overlay_name = PRESETS[preset]
    out = work_dir / (input_path.stem + (".tif" if fmt == "tif" else ".jpg"))
    # TIFF 16-bit (để chỉnh tiếp trong Lightroom/Photoshop) hoặc JPEG chất lượng 95, không nén gộp màu (4:4:4).
    output_flags = ["-t", "-b16"] if fmt == "tif" else ["-j95", "-js3"]

    _run(
        [
            cli, "-Y",
            "-p", str(bundled_profile(cli, base_name)),
            "-p", str(PROFILES_DIR / overlay_name),
            "-o", str(out), *output_flags,
            "-c", str(input_path),
        ],
        "RawTherapee",
    )
    if not out.is_file():
        raise RuntimeError("RawTherapee không tạo ra ảnh kết quả. File RAW có thể hỏng hoặc máy ảnh chưa được hỗ trợ.")

    copy_metadata(input_path, out)
    return out
