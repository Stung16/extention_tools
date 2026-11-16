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
| `monitor/` | Trình giám sát: app desktop xem job chờ/đang chạy/lỗi, máy xử lý và dịch vụ nào đang bật, thử lại/huỷ job | Rust (Tauri) + HTML/CSS/JS |

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

## Trình giám sát (app desktop)

App desktop trong `monitor/` (Tauri: vỏ Rust, giao diện HTML/CSS/JS trong `monitor/ui/`), cứ 2 giây
hỏi API:

- **Cần chú ý**: tự báo khi worker tắt mà vẫn có job chờ, Stirling-PDF/Gotenberg không chạy, job quá
  hạn giữ chỗ, job chờ quá 5 phút, có job lỗi.
- **Băng chuyền** Hàng chờ → Đang xử lý (đồng hồ chạy, thanh giữ chỗ) → Kết quả 24 giờ.
- Máy xử lý và dịch vụ, biểu đồ số job từ lúc mở app, con số chung.
- Bảng có tab (Hàng chờ, Lịch sử 24 giờ, Theo công cụ), tìm kiếm (phím `/`), bộ lọc.
- Bấm một job để xem chi tiết: **Thử lại** job lỗi, **Huỷ** job đang chờ (bấm hai lần), chép mã job.
- Nút Cài đặt: đổi địa chỉ API và mã quản trị (lưu lại cho lần sau). Sáng/tối theo Windows.
- Cột **Nguồn**: job đến từ trang web hay từ app khách nào (API v1), thuộc lô nào.

Cần Rust (https://rustup.rs) và WebView2 (Windows 11 có sẵn). Trong thư mục `monitor`:

```
cargo run --release
```

Lần đầu build mất vài phút. File chạy được: `monitor/target/release/monitor.exe` (khoảng 10 MB), chép
đi đâu dùng cũng được. Sửa giao diện trong `monitor/ui/` thì chạy lại lệnh trên (giao diện được nhúng
vào file .exe). Mặc định nối `http://localhost:5100` với mã quản trị `dev-admin-key`; các dịch vụ khác được
kiểm tra trên cùng máy với API (cổng 8080, 3000, 11434). Dịch vụ "đang chạy" nếu trả lời bất kỳ mã HTTP
nào. "Thời gian trung bình" tính từ lúc gửi file tới lúc xong, gồm cả thời gian chờ.

## Rửa ảnh RAW (worker "photo", không dùng AI)

Công cụ `raw-develop` (dùng qua API v1, chưa có trên trang web): RawTherapee rửa RAW (khử nhoè quang học,
sửa lỗi ống kính tự động, khử nhiễu với kiểu "Ảnh tối, ISO cao"), ExifTool xoá thông tin phần mềm tự ghi
rồi chép nguyên metadata gốc của file RAW (máy, ống kính, ngày chụp, bản quyền). Kết quả JPEG chất lượng
95 (4:4:4) hoặc TIFF 16-bit. Profile bổ sung ở `worker/handlers/photo_profiles/`.

Cài trên máy chạy worker (Windows):
1. **RawTherapee** bản Windows từ rawtherapee.com (có `rawtherapee-cli.exe`).
2. **ExifTool** bản Windows từ exiftool.org: đổi tên `exiftool(-k).exe` thành `exiftool.exe`, để ở
   `C:\Tools\exiftool\` (hoặc đặt biến `EXIFTOOL`).

Rồi chạy worker với `WORKER_PROFILE=photo` (hoặc `all`). Docker: image worker đã có sẵn cả hai.

## API v1 cho app khách

Thiết kế đầy đủ: [docs/kien-truc-he-thong.md](docs/kien-truc-he-thong.md). Tóm tắt (header
`Authorization: Bearer <khoá API>`; khoá tạo bằng cửa quản trị, chỉ hiện một lần):

```
POST /api/admin/clients {"name": "Web nhiếp ảnh"}     (X-Admin-Key) -> {"key": "ccf_..."}
POST /v1/uploads        {"fileName": "a.arw", "size": 25639680} -> {"id", "uploadUrl", "method": "PUT"}
PUT  <uploadUrl>        (thân request = nội dung file)
POST /v1/batches        {"type": "raw-develop", "options": {"preset": "natural", "format": "jpg"},
                         "uploadIds": ["..."], "externalId": "don-123"}   + header Idempotency-Key
GET  /v1/batches/{id}   -> counts (pending/processing/done/failed/cancelled), finished, jobs
POST /v1/batches/{id}/cancel
GET  /v1/jobs/{id}      GET /v1/jobs/{id}/result -> {"url", "fileName", "size", "expiresAt"}
GET  /v1/job-types
```

Kiểm tra toàn bộ (API chạy sẵn, nên dùng `DataDir` tạm): trong `worker`,
`.venv\Scripts\python.exe ..\tests\smoke_v1.py` (tự bật worker main ở giữa chừng).

## Thêm một công cụ mới

1. **Worker**: viết hàm `xu_ly(input_path, work_dir, options)` trong `worker/handlers/`, trả về đường
   dẫn file kết quả; đăng ký trong `worker/handlers/__init__.py` (nhóm `MAIN`, AI hoặc PHOTO).
2. **API**: thêm một dòng vào `api/JobCatalog.cs` (tên, đuôi file nhận, tuỳ chọn).
3. **Trang web**: thêm một dòng vào `web/src/catalog.js` với `job` trùng tên loại job.
   Công cụ chạy trên trình duyệt thì viết component trong `web/src/tools/` và khai báo `client`.

## Cấu hình

| Biến | Ở đâu | Mặc định | Ý nghĩa |
|---|---|---|---|
| `WORKER_KEY` / `WorkerKey` | .env, API, worker | `dev-worker-key` | Mã bí mật giữa API và worker. **Đổi trước khi mở ra internet** |
| `ADMIN_KEY` / `AdminKey` | .env, API, app giám sát | `dev-admin-key` | Mã cửa quản trị (app giám sát, tạo khoá app khách). **Đổi trước khi mở ra internet** |
| `STORAGE_SIGNING_KEY` / `Storage:SigningKey` | .env, API | (dev có sẵn) | Khoá ký link tải lên/tải về của API v1. **Đổi trước khi mở ra internet** |
| `Upload:MaxBytes` | API | 1 GB | Dung lượng tối đa mỗi file tải lên qua API v1 (form trang web vẫn 100 MB) |
| `WORKER_PROFILE` | worker | `main` | `main`, `ai`, `photo` hoặc `all` |
| `RAWTHERAPEE_CLI`, `EXIFTOOL` | worker photo | tự tìm (PATH, thư mục cài chuẩn) | Đường dẫn chương trình rửa ảnh RAW |
| `API_URL`, `GOTENBERG_URL`, `STIRLING_URL` | worker | localhost:5100 / 3000 / 8080 | Địa chỉ các dịch vụ |
| `OLLAMA_URL`, `OLLAMA_MODEL` | worker AI | localhost:11434, `qwen2.5:7b` | Mô hình cho Tóm tắt/Dịch |
| `WHISPER_MODEL` | worker AI | `large-v3-turbo` (GPU) / `small` (CPU) | Mô hình chép lời |
| `MODELS_DIR` | worker AI | `models/` | Nơi lưu mô hình tải về |
| `YTDLP_COOKIES` | worker AI | (không có) | File cookies YouTube |
| `ACESTEP_URL` | worker AI | `http://localhost:8001` | Máy chủ ACE-Step (tạo nhạc) |
| `PDF2ZH_BIN` | worker AI | tự tìm `.venv-pdf2zh` | Chương trình pdf2zh_next (dịch PDF giữ bố cục) |
| `VIENEU_PRECISION` | worker AI | `fp32` | `int8` để đọc nhanh hơn trên CPU hỗ trợ VNNI |
| `STIRLING_API_KEY` | worker | (không có) | Chỉ cần khi bật lại đăng nhập Stirling |
| `DataDir` | API | `api/data` | Nơi lưu database (`jobs.db`) và kho file (`files/`) |

## Các endpoint của API

Cho trang web: `GET /api/job-types` (danh sách công cụ, có `online` = máy xử lý đang bật),
`POST /api/jobs` (form: `type`, `file` hoặc `url`, các tuỳ chọn), `GET /api/jobs/{id}`,
`GET /api/jobs/{id}/output`.

Cho worker (header `X-Worker-Key`): `GET /api/jobs/next?types=a,b` (204 = không có job; có thì trả
kèm `attempt` = số lượt), `GET /api/jobs/{id}/input`, `POST /api/jobs/{id}/heartbeat?attempt=n`
(gia hạn giữ job), `POST /api/jobs/{id}/complete` (form `file`, `attempt`), `POST /api/jobs/{id}/fail`
(JSON `error`, `attempt`).

Cho trình giám sát (header `X-Admin-Key`): `GET /api/admin/overview` (số job theo trạng thái, theo
công cụ, worker, job đang chạy, hàng chờ, 100 job vừa kết thúc, nguồn job, dung lượng file),
`POST /api/admin/jobs/{id}/retry` (job lỗi/đã huỷ → hàng chờ), `POST /api/admin/jobs/{id}/cancel` (job đang
chờ → đã huỷ), `POST /api/admin/clients`, `GET /api/admin/clients`, `POST /api/admin/clients/{id}/disable`.

Cho app khách: xem mục "API v1 cho app khách" ở trên.

## Lưu ý

- Mật khẩu (công cụ đặt/gỡ mật khẩu) bị xoá khỏi database ngay khi job xong, không trả ra ngoài,
  và bị che `***` trong log worker.
- Database tạo bằng `EnsureCreated`: đổi bảng Jobs thì phải xoá `api/data/jobs.db` (chỉ khi phát triển).
- Giới hạn mỗi file tải lên: 100 MB.
