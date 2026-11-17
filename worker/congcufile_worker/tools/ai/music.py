"""Tạo nhạc AI bằng ACE-Step 1.5 (mã nguồn MIT), gọi qua máy chủ REST của ACE-Step.

ACE-Step cài và chạy RIÊNG trên máy GPU (theo README của họ):
    git clone https://github.com/ACE-Step/ACE-Step-1.5.git
    cd ACE-Step-1.5
    uv sync
    uv run acestep-api          # mở cổng 8001
Biến môi trường:
  ACESTEP_URL      địa chỉ máy chủ ACE-Step (mặc định http://localhost:8001;
                   worker chạy trong Docker thì dùng http://host.docker.internal:8001)
  ACESTEP_API_KEY  khoá API nếu máy chủ ACE-Step có đặt (không bắt buộc)

CHƯA chạy thử thật (máy phát triển không đủ GPU): các trường dưới đây theo tài liệu docs/en/API.md của ACE-Step.
"""

import json
import time
from pathlib import Path

import requests

from congcufile_worker.config import settings
from congcufile_worker.core.errors import ToolError
from congcufile_worker.tools.ai.common import log

TIMEOUT_SECONDS = 30 * 60


def _headers() -> dict:
    key = settings().acestep_api_key
    return {"Authorization": f"Bearer {key}"} if key else {}


def _call(path: str, body: dict) -> dict:
    try:
        r = requests.post(f"{settings().acestep_url}{path}", json=body, headers=_headers(), timeout=120)
    except requests.ConnectionError:
        raise ToolError(
            f"Không kết nối được máy chủ ACE-Step ở {settings().acestep_url}. Đã chạy 'uv run acestep-api' chưa?"
        ) from None
    if r.status_code >= 400:
        raise ToolError(f"ACE-Step báo lỗi {r.status_code}: {r.text[:200]}")
    return r.json()


def generate(input_path, work_dir: Path, options: dict) -> Path:
    body = {
        "prompt": options["prompt"],
        "lyrics": options.get("lyrics", ""),
        "audio_duration": float(options.get("duration", "60")),
        "audio_format": "mp3",
        "batch_size": 1,  # chỉ cần 1 bản (mặc định của ACE-Step là 2)
        "thinking": False,
    }
    task_id = _call("/release_task", body)["data"]["task_id"]
    log.info("ACE-Step nhận việc %s", task_id)

    started = time.time()
    while time.time() - started < TIMEOUT_SECONDS:
        time.sleep(5)
        data = _call("/query_result", {"task_id_list": [task_id]}).get("data")
        items = data if isinstance(data, list) else [data]
        item = next((x for x in items if x and x.get("task_id") == task_id), items[0] if items else None)
        if not item:
            continue
        status = item.get("status")
        if status == 2:
            raise ToolError(f"ACE-Step tạo nhạc thất bại: {item.get('error') or item.get('result')}")
        if status == 1:
            result = item.get("result")
            if isinstance(result, str):
                result = json.loads(result)
            if isinstance(result, list):
                result = result[0]
            file_url = result["file"]  # dạng "/v1/audio?path=..."
            audio = requests.get(f"{settings().acestep_url}{file_url}", headers=_headers(), timeout=300)
            audio.raise_for_status()
            out = work_dir / "nhac-ai.mp3"
            out.write_bytes(audio.content)
            return out
    raise ToolError("ACE-Step chạy quá 30 phút chưa xong.")
