# Worker (Python)

Worker cứ vài giây hỏi API "có job không?", có thì xử lý trong thư mục tạm rồi gửi kết quả lên. Chạy:

```
python main.py                       # WORKER_PROFILE mặc định là main
$env:WORKER_PROFILE = "photo"; python main.py
```

Cài thư viện: xem README gốc (mục "Cách 2") và `docs/cai-dat-may-rtx.md`.

## Cấu trúc

```
main.py                         chỉ gọi congcufile_worker.app.main()
congcufile_worker/
  app.py                        khởi động: đọc cấu hình, chọn bộ công cụ theo WORKER_PROFILE, chạy vòng lặp
  config.py                     MỌI biến môi trường đọc ở đây (Settings); nơi khác gọi settings()
  registry.py                   danh sách công cụ: loại job -> hàm xử lý, chia nhóm main / ai / photo
  core/                         phần lõi, không biết gì về từng công cụ
    api_client.py               gọi API: xin việc, tải file vào, gửi kết quả (tự thử lại), báo lỗi, tín hiệu sống
    heartbeat.py                luồng phụ gửi tín hiệu sống trong lúc xử lý
    runner.py                   vòng lặp: xin việc -> thư mục tạm -> gọi công cụ -> gửi kết quả / báo lỗi
    process.py                  chạy chương trình ngoài (FFmpeg, RawTherapee...) và tìm đường dẫn chương trình
    errors.py                   ToolError (lỗi báo cho người dùng), JobTakenBackError
    models.py                   Job, kiểu Handler
  tools/                        các công cụ, chia theo nhóm
    pdf/                        gotenberg.py, stirling.py (gọi Stirling-PDF), to_pdf.py, from_pdf.py, edit.py,
                                compress.py, converters.py (XPS, DjVu, DXF, ảnh sang chữ)
    image/images.py             nén, đổi định dạng ảnh (Pillow)
    media/ffmpeg.py             video, âm thanh (FFmpeg)
    ai/                         chép lời, lọc tạp âm, tách giọng, làm nét ảnh, giọng nói, tóm tắt/dịch
    photo/raw_develop.py        rửa ảnh RAW (RawTherapee + ExifTool), profiles/*.pp3
tests/                          pytest
```

Quy tắc: `core/` không import `tools/`. Công cụ chỉ dùng `config.settings()`, `core.process`, `core.errors`.

## Một job đi qua worker thế nào

1. `JobRunner.run_once` gọi `ApiClient.next_job(các loại job worker làm được)`.
2. Có việc: mở luồng `Heartbeat` (cứ 30 giây gia hạn giữ job), tạo thư mục tạm, tải file vào `input.<đuôi>`.
3. Gọi hàm công cụ trong `registry.py`: `handler(input_path, work_dir, options) -> đường dẫn kết quả`.
4. `ApiClient.upload_result` gửi kết quả (lỗi mạng/5xx thì thử lại sau 5, 10, 20, 40 giây; 409 = job đã giao
   cho lượt khác thì bỏ). Công cụ ném lỗi thì `report_failure` gửi câu lỗi lên API, worker chạy tiếp job khác.

## Thêm một công cụ mới

1. Viết hàm trong `tools/<nhóm>/` (nhóm mới thì tạo thư mục mới có `__init__.py`):
   ```python
   def xoay_anh(input_path: Path, work_dir: Path, options: dict) -> Path:
       out = work_dir / "output.jpg"
       ...  # xử lý; lỗi người dùng cần biết thì: raise ToolError("Câu tiếng Việt dễ hiểu.")
       return out
   ```
   Cần chương trình ngoài thì dùng `run_program([...], "Tên chương trình", "gợi ý cài")`.
   Cần cấu hình mới thì thêm trường vào `Settings` trong `config.py`, đọc bằng `settings().ten_truong`.
2. Thêm một dòng vào `registry.py`, trong nhóm phù hợp: `"rotate-image": images.xoay_anh,`.
3. Khai báo loại job trong `api/src/CongCuFile.Domain/Catalog/JobCatalog.cs` (cùng tên, đúng `Worker:`)
   và thêm vào `web/src/catalog.js`. Test `test_each_api_job_type_has_a_handler_in_the_right_worker` sẽ báo
   nếu hai bên lệch nhau.
4. Viết test trong `tests/`, chạy `pytest` và `ruff check .`.

## Kiểm tra code

```
.venv\Scripts\pip install -r requirements-dev.txt   # một lần: pytest, ruff
.venv\Scripts\python -m pytest                       # chạy test
.venv\Scripts\ruff check .                           # tìm lỗi, kiểm tra quy ước
.venv\Scripts\ruff format .                          # tự định dạng code
```

Test FFmpeg tự bỏ qua nếu máy không có FFmpeg. Kiểm tra cùng API thật: `..\tests\smoke_v1.py` (xem README gốc).

## Cấu hình (biến môi trường, đều có mặc định)

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `API_URL`, `WORKER_KEY` | `http://localhost:5100`, `dev-worker-key` | Kết nối API |
| `WORKER_PROFILE` | `main` | `main`, `ai`, `photo` hoặc `all` |
| `HEARTBEAT_SECONDS` | `30` | Khoảng cách gửi tín hiệu sống |
| `GOTENBERG_URL`, `STIRLING_URL`, `STIRLING_API_KEY` | localhost:3000, localhost:8080, (không) | Dịch vụ PDF |
| `FFMPEG` | `ffmpeg` | Đường dẫn FFmpeg |
| `MODELS_DIR` | `models/` ở gốc dự án | Nơi lưu mô hình AI |
| `AI_DEVICE`, `WHISPER_DEVICE`, `WHISPER_MODEL`, `WHISPER_COMPUTE` | tự chọn | CPU/GPU, mô hình chép lời |
| `OLLAMA_URL`, `OLLAMA_MODEL` | localhost:11434, `qwen2.5:7b` | Tóm tắt, dịch |
| `ACESTEP_URL`, `ACESTEP_API_KEY` | localhost:8001 | Tạo nhạc |
| `PDF2ZH_BIN`, `YTDLP_COOKIES`, `VIENEU_PRECISION` | (tự tìm / không) | Dịch PDF, YouTube, giọng nói |
| `RAWTHERAPEE_CLI`, `EXIFTOOL` | tự tìm | Rửa ảnh RAW |
