# Cài đặt máy RTX (máy chạy thật)

Máy: Core Ultra 5 245K, RAM 64 GB, RTX 5060 Ti 16 GB, Windows. Làm theo thứ tự từ trên xuống.
Xong thì chạy script kiểm tra ở cuối: nó báo còn thiếu gì.

> Mọi thứ trong `data/`, `models/`, `.env`, `node_modules/`, `api/src/CongCuFile.Api/wwwroot/`, `.venv*`, `monitor/target/`
> **không có trên Git**. Máy mới clone về phải tự tạo lại (các bước dưới đây).

## 1. Phần mềm cần cài (một lần)

| # | Phần mềm | Bản | Dùng cho | Ghi chú |
|---|---|---|---|---|
| 1 | **Driver NVIDIA** | **570 trở lên** | GPU cho worker AI | Cài trên Windows, KHÔNG cài driver bên trong WSL. RTX 50 cần CUDA 12.8+ |
| 2 | **Git** | mới nhất | lấy code | |
| 3 | **Docker Desktop** | mới nhất | Stirling-PDF, Gotenberg, Ollama (và cả hệ thống nếu chạy bằng Docker) | Bật "Use the WSL 2 based engine". Vào Settings → Resources → **Disk image location**, chọn ổ lớn (không để ổ C: image AI 8-10 GB, mô hình vài chục GB) |
| 4 | **.NET SDK** | **10** | API | |
| 5 | **Python** | **3.12** (64-bit) | worker | Lúc cài tick **"Add python.exe to PATH"** |
| 6 | **Node.js** | **22** | build trang web | |
| 7 | **FFmpeg** | bản "full" | video, âm thanh | `winget install Gyan.FFmpeg`, mở lại terminal để có trong PATH |
| 8 | **Visual Studio Build Tools** | 2022 | Rust và vài gói Python cần biên dịch | Chọn "Desktop development with C++" |
| 9 | **Rust** | stable | build app giám sát | https://rustup.rs (chọn mặc định) |
| 10 | **RawTherapee** | 5.x | rửa ảnh RAW (worker photo) | Bản Windows từ rawtherapee.com, cài mặc định vào `C:\Program Files\RawTherapee\...` |
| 11 | **ExifTool** | mới nhất | chép metadata ảnh RAW | Bản Windows từ exiftool.org. Giải nén, đổi tên `exiftool(-k).exe` → `exiftool.exe`, để ở **`C:\Tools\exiftool\exiftool.exe`** |

WebView2 (cho app giám sát) có sẵn trên Windows 11.

**Không cần nữa** (các công cụ này đã gỡ khỏi trang web, chỉ cài nếu bật lại): ACE-Step + `uv` (tạo nhạc),
`.venv-pdf2zh` (dịch PDF giữ bố cục), cookies YouTube.

## 2. Lấy code và tạo cấu hình

```powershell
git clone https://github.com/Stung16/extention_tools.git
cd extention_tools
copy .env.example .env
```

Mở `.env`, thay **cả ba mã bí mật** bằng chuỗi ngẫu nhiên dài (mỗi mã một chuỗi khác nhau). Tạo một chuỗi:

```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

| Biến trong `.env` | Ai dùng | Phải trùng với |
|---|---|---|
| `WORKER_KEY` | API và mọi worker | `WORKER_KEY` của worker chạy tay (nếu có) |
| `ADMIN_KEY` | API và app giám sát | ô "Mã quản trị" trong Cài đặt của app giám sát |
| `STORAGE_SIGNING_KEY` | API | (chỉ API dùng) |

Bỏ dấu `#` ở dòng `COMPOSE_PROFILES=ai` để bật phần AI.

**Đã từng chạy bản cũ trên máy này?** Cấu trúc database đã đổi: xoá (hoặc đổi tên) `data/api/jobs.db`
(chạy Docker) hoặc `api/src/CongCuFile.Api/data/jobs.db` (chạy tay), nếu không API sẽ báo lỗi kiểu "no such column".

## 3. Chạy hệ thống

### Cách khuyên dùng: Docker

```powershell
docker run --rm --gpus all nvidia/cuda:12.8.1-base-ubuntu24.04 nvidia-smi   # Docker thấy GPU chưa
docker compose up -d --build
```

Lần đầu rất lâu (Stirling-PDF tải hơn 10 phút, image AI 8-10 GB). Chạy các dịch vụ: `api` (trang web
http://localhost:5100), `stirling-pdf`, `gotenberg`, `worker` (main), `worker-photo` (ảnh RAW, đã có sẵn
RawTherapee + ExifTool trong image), và với profile `ai`: `ollama`, `worker-ai`.
Xem log: `docker compose logs -f worker-ai` (hoặc `worker`, `worker-photo`, `api`).

> **Chưa ai build và chạy thử image AI (`Dockerfile.ai`)**: máy phát triển không đủ ổ C. Nếu image AI lỗi,
> chạy worker AI bằng tay (bên dưới) trong lúc sửa.

### Cách chạy tay (khi phát triển, sửa code thấy ngay)

Chỉ chạy một trong hai cách: cả hai đều dùng cổng 5100. Dịch vụ phụ vẫn chạy bằng Docker:

```powershell
docker compose up -d stirling-pdf gotenberg
docker compose --profile ai up -d ollama
```

Trang web (một lần, và mỗi khi sửa giao diện):

```powershell
cd web; npm install; npm run build; cd ..
```

API (cửa sổ 1, đọc mã từ `api/appsettings.Development.json`, khi chạy thật đặt biến môi trường
`WorkerKey`, `AdminKey`, `Storage__SigningKey`):

```powershell
cd api; dotnet run --project src/CongCuFile.Api
```

Worker main (cửa sổ 2), worker photo (cửa sổ 3), worker AI (cửa sổ 4):

```powershell
cd worker
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python main.py                                        # worker main

$env:WORKER_PROFILE = "photo"; .venv\Scripts\python main.py        # worker photo (dùng chung .venv)

python -m venv .venv-ai
.venv-ai\Scripts\pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128
.venv-ai\Scripts\pip install -r requirements-ai.txt
$env:WORKER_PROFILE = "ai"; .venv-ai\Scripts\python main.py        # worker AI
```

Kiểm tra PyTorch thấy GPU: `.venv-ai\Scripts\python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"`
phải ra `True` và tên card RTX 5060 Ti.

## 4. OCR tiếng Việt (một lần, sau khi Stirling-PDF đã chạy)

```powershell
docker cp stirling-pdf:/usr/share/tesseract-ocr/5/tessdata/. data/stirling/tessdata/
curl.exe -L -o data/stirling/tessdata/vie.traineddata https://github.com/tesseract-ocr/tessdata_best/raw/main/vie.traineddata
docker compose restart stirling-pdf
```

## 5. App giám sát

```powershell
cd monitor; cargo run --release
```

Lần đầu build vài phút. Mở **Cài đặt** trong app, nhập **Mã quản trị** = `ADMIN_KEY` trong `.env`
(chạy tay với cấu hình dev thì là `dev-admin-key`). File chạy được: `monitor\target\release\monitor.exe`.

## 6. Kiểm tra

1. Script kiểm tra máy (báo phần mềm nào thiếu, sai bản, cấu hình nào chưa đổi):
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\kiem-tra-may.ps1
   ```
2. Kiểm tra API v1 với worker thật (cần API đang chạy, nên dùng thư mục dữ liệu tạm; khi chạy Docker thì
   đặt `$env:ADMIN_KEY` và `$env:WORKER_KEY` trùng `.env`):
   ```powershell
   cd worker; .venv\Scripts\python.exe ..\tests\smoke_v1.py
   ```
3. Mở app giám sát: các worker phải hiện chấm xanh, Stirling-PDF và Gotenberg đang chạy.

## Lỗi đã từng gặp

| Hiện tượng | Nguyên nhân / cách sửa |
|---|---|
| `unsatisfied condition: cuda>=12.8` | Driver NVIDIA cũ: cài bản 570 trở lên |
| API báo "no such column" / lỗi database lúc mở | Database của bản cũ: xoá `jobs.db` (xem mục 2) |
| API báo "Chưa cấu hình AdminKey" (hoặc WorkerKey, Storage:SigningKey) | Thiếu mã trong `.env` (Docker) hoặc biến môi trường (chạy tay ngoài môi trường Development) |
| App giám sát báo "mã quản trị không khớp" | Ô Mã quản trị trong Cài đặt phải trùng `ADMIN_KEY` (không phải `WORKER_KEY`) |
| `npm run build` báo EBUSY | API đang giữ thư mục `wwwroot` của API; script đã tự xoá từng file, nếu vẫn lỗi thì tắt API rồi build lại |
| Cổng 5100 đã bị dùng | Đang chạy cả Docker lẫn `dotnet run`: tắt một bên |
| faster-whisper lỗi `metadata_errors` | Gói `av` phải dưới 16 (`requirements-ai.txt` đã ghim 15.1.0) |
| Job RAW lỗi "chưa cài rawtherapee-cli" / "exiftool" | Cài theo mục 1, hoặc đặt biến `RAWTHERAPEE_CLI`, `EXIFTOOL` trỏ tới file .exe |
| Test bằng `curl` trong Git Bash làm vỡ dấu tiếng Việt | Dùng Python `requests` hoặc trình duyệt |
| YouTube báo "not a bot" | (Công cụ đã gỡ) cần cookies, xem README |
