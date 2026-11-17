"""Rửa ảnh RAW trung thực, KHÔNG dùng AI: RawTherapee (bản dòng lệnh) + ExifTool.

Mọi bước đều là thuật toán cổ điển, không vẽ thêm chi tiết:
  - làm nét bằng khử nhoè quang học (capture sharpening, deconvolution): đảo ngược phần nhoè do ống kính;
  - sửa lỗi ống kính tự động theo cơ sở dữ liệu lensfun (méo hình, tối góc);
  - khử nhiễu (preset "Ảnh tối, ISO cao");
  - cân bằng trắng theo máy chụp.
Sau đó ExifTool xoá hết thông tin RawTherapee tự ghi vào ảnh (trừ hồ sơ màu ICC) rồi chép NGUYÊN metadata
gốc từ file RAW sang (máy, ống kính, ngày chụp, bản quyền...). Không thêm thẻ nào nhắc tới phần mềm hay AI.

Cấu hình (xem config.py):
  RAWTHERAPEE_CLI  đường dẫn rawtherapee-cli (mặc định: tìm trong PATH, rồi C:\\Program Files\\RawTherapee\\*)
  EXIFTOOL         đường dẫn exiftool       (mặc định: tìm trong PATH, rồi C:\\Tools\\exiftool)
"""

from pathlib import Path

from congcufile_worker.config import settings
from congcufile_worker.core.errors import ToolError
from congcufile_worker.core.process import find_program, run_program

PROFILES_DIR = Path(__file__).resolve().parent / "profiles"

# Mỗi kiểu rửa = một profile có sẵn của RawTherapee làm nền + một profile bổ sung của mình (profiles/).
PRESETS = {
    "natural": ("Auto-Matched Curve - ISO Low.pp3", "natural.pp3"),
    "high-iso": ("Auto-Matched Curve - ISO High.pp3", "high-iso.pp3"),
}

RAWTHERAPEE_FALLBACKS = [
    r"C:\Program Files\RawTherapee\*\rawtherapee-cli.exe",
    r"C:\Program Files\RawTherapee\rawtherapee-cli.exe",
]
EXIFTOOL_FALLBACKS = [r"C:\Tools\exiftool\exiftool.exe", r"C:\Tools\exiftool*\exiftool.exe"]

# Một ảnh RAW lớn rửa trên CPU có thể mất cả phút; quá 15 phút coi như treo.
TIMEOUT_SECONDS = 900


def rawtherapee_cli() -> str:
    return find_program(
        settings().rawtherapee_cli, ["rawtherapee-cli"], RAWTHERAPEE_FALLBACKS, setting_name="RAWTHERAPEE_CLI"
    )


def exiftool() -> str:
    return find_program(settings().exiftool, ["exiftool"], EXIFTOOL_FALLBACKS, setting_name="EXIFTOOL")


def bundled_profile(cli: str, name: str) -> Path:
    """Profile có sẵn đi kèm RawTherapee (Windows: cạnh file .exe; Linux: /usr/share/rawtherapee)."""
    for root in (Path(cli).parent / "profiles", Path("/usr/share/rawtherapee/profiles")):
        candidate = root / name
        if candidate.is_file():
            return candidate
    raise ToolError(f"Không tìm thấy profile có sẵn '{name}' của RawTherapee.")


def metadata_command(exiftool_path: str, raw: Path, out: Path) -> list[str]:
    """Lệnh ExifTool: xoá metadata RawTherapee ghi (giữ ICC) rồi chép nguyên metadata của file RAW sang."""
    return [
        exiftool_path,
        "-overwrite_original",
        "-m",
        # Xoá hết những gì RawTherapee tự ghi (Software, XMP...), trừ hồ sơ màu.
        "-all=",
        "--ICC_Profile:all",
        # Chép lại toàn bộ thông tin gốc từ file RAW.
        "-TagsFromFile",
        str(raw),
        "-all:all",
        "-unsafe",
        # Trừ: hướng xoay (ảnh đã được xoay thật), ảnh xem trước/ảnh nhỏ nhúng trong RAW, hồ sơ màu.
        "--Orientation",
        "--ICC_Profile:all",
        "--PreviewImage",
        "--ThumbnailImage",
        "--JpgFromRaw",
        "--OtherImage",
        "--PreviewTIFF",
        "--ThumbnailTIFF",
        str(out),
    ]


def develop_command(cli: str, preset: str, fmt: str, raw: Path, out: Path) -> list[str]:
    """Lệnh RawTherapee: profile nền + profile bổ sung, xuất TIFF 16-bit hoặc JPEG 95 (4:4:4)."""
    base_name, overlay_name = PRESETS[preset]
    output_flags = ["-t", "-b16"] if fmt == "tif" else ["-j95", "-js3"]
    return [
        cli,
        "-Y",
        "-p",
        str(bundled_profile(cli, base_name)),
        "-p",
        str(PROFILES_DIR / overlay_name),
        "-o",
        str(out),
        *output_flags,
        "-c",
        str(raw),
    ]


def develop(input_path: Path, work_dir: Path, options: dict) -> Path:
    """Rửa một ảnh RAW. options: preset (natural | high-iso), format (jpg | tif)."""
    preset = options.get("preset", "natural")
    fmt = options.get("format", "jpg")
    if preset not in PRESETS:
        raise ToolError(f"Kiểu rửa không hợp lệ: {preset}")

    cli = rawtherapee_cli()
    out = work_dir / (input_path.stem + (".tif" if fmt == "tif" else ".jpg"))
    run_program(develop_command(cli, preset, fmt, input_path, out), "RawTherapee", timeout=TIMEOUT_SECONDS)
    if not out.is_file():
        raise ToolError("RawTherapee không tạo ra ảnh kết quả. File RAW có thể hỏng hoặc máy ảnh chưa được hỗ trợ.")

    run_program(metadata_command(exiftool(), input_path, out), "ExifTool")
    return out
