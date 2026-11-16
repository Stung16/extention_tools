"""Tóm tắt và dịch tài liệu bằng mô hình ngôn ngữ chạy trên Ollama (máy local, không gửi ra ngoài).

Ollama là chương trình chạy mô hình AI trên máy mình; chạy trong Docker (xem docker-compose.yml).
Biến môi trường:
  OLLAMA_URL    địa chỉ Ollama (mặc định http://localhost:11434)
  OLLAMA_MODEL  tên mô hình (mặc định qwen2.5:7b, hợp với GPU 16 GB; máy yếu dùng qwen2.5:1.5b)
Mô hình chưa có thì worker tự tải về Ollama ở lần đầu (vài GB, mất vài phút).
"""

import os
import re
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

import requests

from .ai_common import log

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434").rstrip("/")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5:7b")

CHUNK_CHARS = 6000          # mỗi lần gửi cho mô hình khoảng 6000 ký tự (~ 2-3 trang)
MAX_SUMMARY_CHARS = 400_000  # ~ 150 trang
MAX_TRANSLATE_CHARS = 120_000  # ~ 40 trang: dịch chậm hơn tóm tắt nhiều

LANGUAGES = {"vi": "tiếng Việt", "en": "tiếng Anh", "zh": "tiếng Trung (giản thể)", "ja": "tiếng Nhật", "ko": "tiếng Hàn"}


# ---------- Gọi Ollama ----------

def _chat(system: str, user: str) -> str:
    body = {
        "model": OLLAMA_MODEL,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "stream": False,
        "options": {"temperature": 0.2, "num_ctx": 8192},
    }
    try:
        r = requests.post(f"{OLLAMA_URL}/api/chat", json=body, timeout=1800)
    except requests.ConnectionError:
        raise RuntimeError(f"Không kết nối được Ollama ở {OLLAMA_URL}. Ollama đã chạy chưa?") from None
    if r.status_code == 404 and "not found" in r.text:
        _pull_model()
        r = requests.post(f"{OLLAMA_URL}/api/chat", json=body, timeout=1800)
    if r.status_code >= 400:
        raise RuntimeError(f"Ollama báo lỗi {r.status_code}: {r.text[:200]}")
    return r.json()["message"]["content"].strip()


def _pull_model():
    log.info("Ollama chưa có mô hình %s: đang tải về (chỉ lần đầu, có thể mất vài phút)...", OLLAMA_MODEL)
    r = requests.post(f"{OLLAMA_URL}/api/pull", json={"model": OLLAMA_MODEL, "stream": False}, timeout=7200)
    if r.status_code >= 400:
        raise RuntimeError(f"Không tải được mô hình {OLLAMA_MODEL}: {r.text[:200]}")


# ---------- Lấy chữ ra khỏi tài liệu ----------

def extract_text(path: Path) -> str:
    ext = path.suffix.lower()
    if ext == ".pdf":
        from pypdf import PdfReader

        text = "\n\n".join((page.extract_text() or "") for page in PdfReader(path).pages)
        if not text.strip():
            raise ValueError("PDF này không có chữ (có thể là bản scan). Hãy dùng công cụ OCR PDF trước.")
        return text
    if ext == ".docx":
        # File .docx là file zip; chữ nằm trong word/document.xml, mỗi đoạn là một thẻ <w:p>.
        with zipfile.ZipFile(path) as z:
            xml = z.read("word/document.xml").decode("utf-8")
        paragraphs = re.findall(r"<w:p[ >].*?</w:p>", xml, flags=re.S)
        lines = ["".join(re.findall(r"<w:t[^>]*>(.*?)</w:t>", p, flags=re.S)) for p in paragraphs]
        import html

        return "\n".join(html.unescape(line) for line in lines)
    return path.read_text(encoding="utf-8", errors="replace")


def _chunks(text: str, size: int = CHUNK_CHARS) -> list[str]:
    """Chia văn bản thành các phần khoảng `size` ký tự, cắt ở chỗ xuống dòng."""
    parts, current = [], ""
    for paragraph in re.split(r"\n\s*\n|\n", text):
        paragraph = paragraph.strip()
        if not paragraph:
            continue
        if current and len(current) + len(paragraph) > size:
            parts.append(current)
            current = ""
        while len(paragraph) > size:  # đoạn quá dài thì cắt cứng
            parts.append(paragraph[:size])
            paragraph = paragraph[size:]
        current = f"{current}\n{paragraph}" if current else paragraph
    if current:
        parts.append(current)
    return parts


# ---------- Tóm tắt ----------

LENGTH_RULES = {
    "short": "Viết 3 đến 5 câu nêu nội dung cốt lõi.",
    "medium": "Liệt kê các ý chính dạng gạch đầu dòng (khoảng 5 đến 10 ý), mỗi ý một hai câu.",
    "long": "Tóm tắt chi tiết theo từng phần của tài liệu, có tiêu đề cho mỗi phần và gạch đầu dòng các ý.",
}
SUMMARY_SYSTEM = ("Bạn là trợ lý tóm tắt tài liệu. Luôn trả lời bằng tiếng Việt, kể cả khi tài liệu là "
                  "ngôn ngữ khác. Chỉ dùng thông tin có trong tài liệu, không bịa thêm.")


def summarize(input_path: Path, work_dir: Path, options: dict) -> Path:
    text = extract_text(input_path)
    if len(text) > MAX_SUMMARY_CHARS:
        raise ValueError(f"Tài liệu quá dài ({len(text):,} ký tự). Tối đa {MAX_SUMMARY_CHARS:,} ký tự.")
    rule = LENGTH_RULES.get(options.get("length", "medium"), LENGTH_RULES["medium"])

    parts = _chunks(text)
    if len(parts) == 1:
        summary = _chat(SUMMARY_SYSTEM, f"{rule}\n\nTÀI LIỆU:\n{parts[0]}")
    else:
        # Tài liệu dài: tóm tắt từng phần trước, rồi gộp các bản tóm tắt thành một.
        notes = []
        for i, part in enumerate(parts, 1):
            log.info("Tóm tắt phần %d/%d", i, len(parts))
            notes.append(_chat(SUMMARY_SYSTEM, f"Ghi lại ngắn gọn các ý quan trọng của đoạn sau:\n\n{part}"))
        summary = _chat(SUMMARY_SYSTEM,
                        f"Dưới đây là ghi chú từ các phần của một tài liệu. {rule}\n\nGHI CHÚ:\n" + "\n\n".join(notes))

    out = work_dir / "output.txt"
    out.write_text(summary + "\n", encoding="utf-8")
    return out


# ---------- Dịch ----------

def translate(input_path: Path, work_dir: Path, options: dict) -> Path:
    target = LANGUAGES.get(options.get("target", "vi"), "tiếng Việt")
    text = extract_text(input_path)
    if len(text) > MAX_TRANSLATE_CHARS:
        raise ValueError(f"Tài liệu quá dài để dịch ({len(text):,} ký tự). Tối đa {MAX_TRANSLATE_CHARS:,} ký tự.")

    system = (f"Bạn là phiên dịch viên chuyên nghiệp. Dịch văn bản người dùng gửi sang {target}. "
              "Giữ nguyên cách xuống dòng, số liệu, tên riêng. Chỉ trả về bản dịch, không giải thích, "
              "không thêm lời mở đầu.")
    parts = _chunks(text, 2500)  # phần nhỏ hơn khi dịch để mô hình không bỏ sót câu
    translated = []
    for i, part in enumerate(parts, 1):
        log.info("Dịch phần %d/%d", i, len(parts))
        translated.append(_chat(system, part))

    out = work_dir / "output.txt"
    out.write_text("\n\n".join(translated) + "\n", encoding="utf-8")
    return out


# ---------- Dịch PDF giữ bố cục (PDFMathTranslate-next, giấy phép AGPL-3.0) ----------
# Chạy như một chương trình riêng (pdf2zh_next), cài trong môi trường Python riêng vì nó kéo theo rất
# nhiều thư viện dễ xung đột. Đường dẫn đặt bằng biến PDF2ZH_BIN; không đặt thì tìm trong PATH, rồi
# tìm trong worker/.venv-pdf2zh.

PDF2ZH_LANGS = {"vi": "vi", "en": "en", "zh": "zh-CN", "ja": "ja", "ko": "ko"}


def _pdf2zh_bin() -> str:
    if os.environ.get("PDF2ZH_BIN"):
        return os.environ["PDF2ZH_BIN"]
    found = shutil.which("pdf2zh_next")
    if found:
        return found
    scripts = "Scripts" if sys.platform == "win32" else "bin"
    local = Path(__file__).resolve().parents[1] / ".venv-pdf2zh" / scripts / ("pdf2zh_next.exe" if sys.platform == "win32" else "pdf2zh_next")
    if local.exists():
        return str(local)
    raise RuntimeError("Máy xử lý chưa cài PDFMathTranslate-next (pdf2zh_next). Xem README, mục worker AI.")


def translate_pdf(input_path: Path, work_dir: Path, options: dict) -> Path:
    mono = options.get("output", "mono") == "mono"
    out_dir = work_dir / "translated"
    cmd = [
        _pdf2zh_bin(), str(input_path),
        "--ollama", "--ollama-model", OLLAMA_MODEL, "--ollama-host", OLLAMA_URL,
        "--lang-out", PDF2ZH_LANGS.get(options.get("target", "vi"), "vi"),
        "--output", str(out_dir),
        "--watermark-output-mode", "no_watermark",
        "--no-dual" if mono else "--no-mono",
    ]
    log.info("Dịch PDF giữ bố cục bằng pdf2zh_next (lần đầu sẽ tải mô hình nhận dạng bố cục)...")
    result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=4 * 3600)
    pattern = "*mono*.pdf" if mono else "*dual*.pdf"
    found = sorted(out_dir.glob(pattern)) if out_dir.exists() else []
    if result.returncode != 0 or not found:
        tail = (result.stderr or result.stdout or "").strip().splitlines()[-5:]
        raise RuntimeError("Dịch PDF lỗi: " + " | ".join(tail)[-400:])
    return found[0].rename(work_dir / "output.pdf")
