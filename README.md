# local-tools

Các công cụ xử lý file chạy trên máy local.

Gồm 3 phần:

- **Docker**: các công cụ có sẵn (Stirling-PDF, Gotenberg).
- **api/** (.NET 10): nhận file người dùng tải lên, tạo job, trả kết quả.
- **worker/** (Python): cứ 3 giây hỏi API có job không, có thì xử lý rồi gửi kết quả lên.

## Cần cài trước

- Git
- Docker Desktop (bật "Use the WSL 2 based engine")
- .NET SDK 10
- Python 3.12
- Máy có card NVIDIA: driver NVIDIA mới nhất, cài trên Windows

## Chạy trên một máy mới

```
git clone <địa chỉ repo của bạn>
cd extention_tools
docker compose up -d
pip install -r worker/requirements.txt
```

Kiểm tra Docker:

- Stirling-PDF: mở http://localhost:8080 (lần đầu phải đăng nhập bằng tài khoản mặc định ghi trên trang, rồi đổi mật khẩu)
- Gotenberg: mở http://localhost:3000/health

## Chạy API và Worker

Mở 2 cửa sổ terminal.

Cửa sổ 1, chạy API (ở http://localhost:5100):

```
cd api
dotnet run
```

Cửa sổ 2, chạy Worker:

```
cd worker
python main.py
```

## Dùng trang web

Khi API và Worker đang chạy, mở http://localhost:5100 trên trình duyệt:
chọn công cụ, kéo thả file vào, bấm "Bắt đầu xử lý", chờ "Xong!" rồi bấm "Tải file kết quả".

Trang web nằm ở `api/wwwroot/index.html` (HTML + JavaScript thuần, do API phục vụ luôn).

## Thử bằng dòng lệnh (curl)

```
curl -F type=word-to-pdf -F "file=@duong-dan/toi/file.docx" http://localhost:5100/api/jobs
```

Lệnh trả về `id` của job. Xem trạng thái, rồi tải kết quả khi trạng thái là `Done`:

```
curl http://localhost:5100/api/jobs/<id>
curl -o ket-qua.pdf http://localhost:5100/api/jobs/<id>/output
```

## Các endpoint của API

Cho người dùng:

| Lệnh | Việc |
|---|---|
| `GET /api/job-types` | Danh sách công cụ (tên, đuôi file được nhận) |
| `POST /api/jobs` (form: `type`, `file`) | Tạo job |
| `GET /api/jobs/{id}` | Xem trạng thái |
| `GET /api/jobs/{id}/output` | Tải file kết quả |

Cho worker (phải gửi header `X-Worker-Key`):

| Lệnh | Việc |
|---|---|
| `GET /api/jobs/next` | Nhận job tiếp theo (204 = không có) |
| `GET /api/jobs/{id}/input` | Tải file đầu vào |
| `POST /api/jobs/{id}/complete` (form: `file`) | Báo xong, gửi file kết quả |
| `POST /api/jobs/{id}/fail` (JSON: `error`) | Báo lỗi |

## Cấu hình

- `WorkerKey` của API: lúc phát triển là `dev-worker-key` (trong `api/appsettings.Development.json`).
  Chạy thật thì đặt biến môi trường `WorkerKey` thành một chuỗi bí mật dài.
- Worker đọc biến môi trường `API_URL`, `WORKER_KEY`, `GOTENBERG_URL`
  (mặc định: `http://localhost:5100`, `dev-worker-key`, `http://localhost:3000`).
- Database (SQLite) và file tải lên nằm ở `api/data/`, không đưa lên Git.

## Cập nhật khi có thay đổi

```
git pull
docker compose up -d
```

## Dừng Docker

```
docker compose down
```
