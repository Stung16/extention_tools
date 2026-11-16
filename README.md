# Công Cụ File

Website gồm nhiều công cụ xử lý file (PDF, ảnh, video, âm thanh, AI) cho người Việt,
làm theo luồng của pdfguru.com. Phần xử lý chạy trên máy local bằng phần mềm mã nguồn mở.

## Các phần

| Thư mục / dịch vụ | Việc | Viết bằng |
|---|---|---|
| `web/` | Trang web: trang chủ, trang từng công cụ, các công cụ chạy ngay trên trình duyệt | React (Vite) |
| `api/` | Nhận file, quản lý hàng đợi job, phục vụ trang web đã build | .NET 10 |
| `worker/` | Cứ 3 giây hỏi API có job không, có thì xử lý. Hai loại: **main** (PDF, ảnh, video) và **ai** | Python |
| Stirling-PDF, Gotenberg | Công cụ PDF và Office có sẵn, chạy trong Docker | |
| Ollama | Chạy mô hình ngôn ngữ cho Tóm tắt, Dịch (chỉ trên máy GPU) | |

Công cụ chia làm 2 kiểu:

- **Chạy trên trình duyệt** (file không gửi lên máy chủ): Sửa PDF, Ký, Ghi chú, Điền biểu mẫu,
  Gộp, Tách, Sắp xếp trang, Cắt lề PDF; Tạo mã QR; Gộp ảnh. Dùng pdf.js (vẽ trang) và pdf-lib (sửa PDF).
- **Chạy trên máy chủ** (qua API + worker): còn lại.

Báo cáo so sánh với pdfguru và kế hoạch: [docs/bao-cao-so-sanh-pdfguru.md](docs/bao-cao-so-sanh-pdfguru.md).

## Cách 1: chạy tất cả bằng Docker (dễ nhất)

Cần: Git, Docker Desktop (bật "Use the WSL 2 based engine").

```
git clone https://github.com/Stung16/extention_tools.git
cd extention_tools
copy .env.example .env
docker compose up -d --build
```

Lần đầu tải và build mất khá lâu (Stirling-PDF tải hơn 10 phút). Xong thì mở **http://localhost:5100**.
Sau đó làm bước [OCR tiếng Việt](#ocr-tiếng-việt-mỗi-máy-làm-một-lần).

### Máy có GPU NVIDIA: bật thêm phần AI

1. Cài driver NVIDIA mới nhất trên Windows (không cài driver bên trong WSL). Image AI dùng CUDA 12.8,
   cần driver bản **570 trở lên**; driver cũ sẽ báo `unsatisfied condition: cuda>=12.8`.
2. Kiểm tra Docker thấy GPU:
   ```
   docker run --rm --gpus all nvidia/cuda:12.8.1-base-ubuntu24.04 nvidia-smi
   ```
3. Mở file `.env`, bỏ dấu `#` ở dòng `COMPOSE_PROFILES=ai`, rồi:
   ```
   docker compose up -d --build
   ```
   Image AI nặng khoảng 8-10 GB. Lần đầu dùng mỗi công cụ AI, worker tự tải mô hình về thư mục
   `models/` (Whisper khoảng 1,6 GB; Ollama `qwen2.5:7b` khoảng 4,7 GB), nên lần đầu sẽ chậm.

Xem log: `docker compose logs -f worker-ai`.

## Cách 2: chạy tay để phát triển (sửa code thấy ngay)

Cần thêm: .NET SDK 10, Python 3.12, Node.js 22, FFmpeg (có trong PATH).
Stirling-PDF và Gotenberg vẫn chạy bằng Docker: `docker compose up -d stirling-pdf gotenberg`.

**Trang web** (làm một lần, và mỗi khi sửa giao diện):

```
cd web
npm install
npm run build
```

`npm run build` đóng gói vào `api/wwwroot`. Khi sửa giao diện có thể dùng `npm run dev`
(mở http://localhost:5173, sửa code là trang tự cập nhật; cần API đang chạy).

**API** (cửa sổ terminal 1):

```
cd api
dotnet run
```

**Worker thường** (cửa sổ 2):

```
cd worker
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python main.py
```

**Worker AI** (cửa sổ 3, tuỳ chọn):

```
cd worker
python -m venv .venv-ai
.venv-ai\Scripts\pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128
.venv-ai\Scripts\pip install -r requirements-ai.txt
$env:WORKER_PROFILE = "ai"; .venv-ai\Scripts\python main.py
```

Dịch PDF giữ bố cục cần thêm PDFMathTranslate-next, cài trong môi trường riêng:

```
python -m venv .venv-pdf2zh
.venv-pdf2zh\Scripts\pip install pdf2zh-next==2.10.2
```

Máy không có GPU: thay `cu128` bằng `cpu` (chạy được nhưng chậm). Tóm tắt/Dịch cần Ollama:
`docker compose --profile ai up -d ollama` (máy không có GPU NVIDIA thì bỏ phần `deploy` của dịch vụ
`ollama` trong docker-compose.yml) và đặt `$env:OLLAMA_MODEL = "qwen2.5:1.5b"` cho máy yếu.

## OCR tiếng Việt (mỗi máy làm một lần)

Gói tiếng Việt nằm trong `data/stirling/tessdata`, mà `data/` không đưa lên Git. Sau khi Stirling-PDF
đã chạy, mở PowerShell ở thư mục dự án:

```
docker cp stirling-pdf:/usr/share/tesseract-ocr/5/tessdata/. data/stirling/tessdata/
curl.exe -L -o data/stirling/tessdata/vie.traineddata https://github.com/tesseract-ocr/tessdata_best/raw/main/vie.traineddata
docker compose restart stirling-pdf
```

## Tạo nhạc AI (ACE-Step, chạy riêng trên máy GPU)

ACE-Step 1.5 (mã nguồn MIT) có máy chủ REST riêng; worker AI gửi yêu cầu sang đó. Cài theo README của họ
(cần `uv`: https://docs.astral.sh/uv/), ở một thư mục ngoài dự án này:

```
git clone https://github.com/ACE-Step/ACE-Step-1.5.git
cd ACE-Step-1.5
uv sync
uv run acestep-api
```

Máy chủ mở ở cổng 8001, lần đầu tự tải mô hình. Card 16 GB: theo bảng của ACE-Step, dùng mô hình 2B
(turbo hoặc sft) với LM 1.7B. Worker trong Docker đã trỏ sẵn tới `http://host.docker.internal:8001`
(đổi bằng biến `ACESTEP_URL` trong `.env`); chạy tay thì mặc định `http://localhost:8001`.
Công cụ này CHƯA được chạy thử thật (máy phát triển không đủ GPU).

## Văn bản sang giọng nói, Dịch PDF giữ bố cục

- **Văn bản sang giọng nói** dùng VieNeu-TTS (gói `vieneu`, Apache-2.0), chạy được trên CPU, có 25 giọng
  (trang web cho chọn 8 giọng). Lần đầu tự tải mô hình về `models/huggingface`.
- **Dịch PDF giữ bố cục** dùng PDFMathTranslate-next (AGPL-3.0) + Ollama. Cần mô hình đủ lớn
  (`qwen2.5:7b` trở lên): mô hình 1.5B dịch sai và để sót ký tự rác. Lần đầu tự tải mô hình nhận dạng bố cục.

## YouTube bị chặn ("Sign in to confirm you're not a bot")

YouTube hay chặn chương trình tải tự động. Cách xử lý: đăng nhập YouTube trên trình duyệt, dùng tiện
ích xuất cookies (định dạng Netscape, file `cookies.txt`), lưu thành `data/cookies/youtube.txt`.

- Chạy Docker: bỏ dấu `#` ở dòng `YTDLP_COOKIES` của dịch vụ `worker-ai` trong docker-compose.yml.
- Chạy tay: `$env:YTDLP_COOKIES = "D:\...\data\cookies\youtube.txt"` trước khi chạy worker AI.

Cookies là thông tin đăng nhập: không đưa lên Git, không gửi cho ai (`data/` đã nằm trong .gitignore).

## Thêm một công cụ mới

1. **Worker**: viết hàm `xu_ly(input_path, work_dir, options)` trong `worker/handlers/`, trả về đường
   dẫn file kết quả; đăng ký trong `worker/handlers/__init__.py` (nhóm `MAIN` hoặc AI).
2. **API**: thêm một dòng vào `api/JobCatalog.cs` (tên, đuôi file nhận, tuỳ chọn).
3. **Trang web**: thêm một dòng vào `web/src/catalog.js` với `job` trùng tên loại job.
   Công cụ chạy trên trình duyệt thì viết component trong `web/src/tools/` và khai báo `client`.

## Cấu hình

| Biến | Ở đâu | Mặc định | Ý nghĩa |
|---|---|---|---|
| `WORKER_KEY` / `WorkerKey` | .env, API, worker | `dev-worker-key` | Mã bí mật giữa API và worker. **Đổi trước khi mở ra internet** |
| `WORKER_PROFILE` | worker | `main` | `main`, `ai` hoặc `all` |
| `API_URL`, `GOTENBERG_URL`, `STIRLING_URL` | worker | localhost:5100 / 3000 / 8080 | Địa chỉ các dịch vụ |
| `OLLAMA_URL`, `OLLAMA_MODEL` | worker AI | localhost:11434, `qwen2.5:7b` | Mô hình cho Tóm tắt/Dịch |
| `WHISPER_MODEL` | worker AI | `large-v3-turbo` (GPU) / `small` (CPU) | Mô hình chép lời |
| `MODELS_DIR` | worker AI | `models/` | Nơi lưu mô hình tải về |
| `YTDLP_COOKIES` | worker AI | (không có) | File cookies YouTube |
| `ACESTEP_URL` | worker AI | `http://localhost:8001` | Máy chủ ACE-Step (tạo nhạc) |
| `PDF2ZH_BIN` | worker AI | tự tìm `.venv-pdf2zh` | Chương trình pdf2zh_next (dịch PDF giữ bố cục) |
| `VIENEU_PRECISION` | worker AI | `fp32` | `int8` để đọc nhanh hơn trên CPU hỗ trợ VNNI |
| `STIRLING_API_KEY` | worker | (không có) | Chỉ cần khi bật lại đăng nhập Stirling |
| `DataDir` | API | `api/data` | Nơi lưu database và file tải lên |

## Các endpoint của API

Cho trang web: `GET /api/job-types` (danh sách công cụ, có `online` = máy xử lý đang bật),
`POST /api/jobs` (form: `type`, `file` hoặc `url`, các tuỳ chọn), `GET /api/jobs/{id}`,
`GET /api/jobs/{id}/output`.

Cho worker (header `X-Worker-Key`): `GET /api/jobs/next?types=a,b` (204 = không có job),
`GET /api/jobs/{id}/input`, `POST /api/jobs/{id}/complete` (form `file`), `POST /api/jobs/{id}/fail`.

## Lưu ý

- Mật khẩu (công cụ đặt/gỡ mật khẩu) bị xoá khỏi database ngay khi job xong, không trả ra ngoài,
  và bị che `***` trong log worker.
- Database tạo bằng `EnsureCreated`: đổi bảng Jobs thì phải xoá `api/data/jobs.db` (chỉ khi phát triển).
- Giới hạn mỗi file tải lên: 100 MB.
