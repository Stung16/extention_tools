# Kiến trúc hệ thống Công Cụ File

Công Cụ File là **nền tảng xử lý file**: trang web công cụ của chính mình, cộng với các app khác (gọi là
**app khách**, ví dụ web cho nhiếp ảnh gia) gọi vào qua API v1. Máy xử lý (worker) chạy ở máy RTX tại nhà.

```
App khách (backend riêng, giữ khoá API)          Người dùng trang web công cụ
              │ /v1 + Authorization: Bearer             │ /api/jobs (ẩn danh)
              ▼                                         ▼
┌──────────────────────── Máy chủ (sau này: máy chủ thuê, có tên miền) ────────────────────────┐
│  API (.NET)  ──  Database (SQLite, sau này PostgreSQL)  ──  Kho file (ổ đĩa, sau này kiểu S3)│
└──────────────────────────────────────────────▲────────────────────────────────────────────────┘
                                               │ worker TỰ hỏi việc (/api/jobs/next), không cần mở cổng
                    ┌──────────────── Máy RTX ở nhà ────────────────┐
                    │ worker main │ worker ai │ worker photo │ app giám sát │
                    └───────────────────────────────────────────────┘
```

## Bốn cửa của API

| Cửa | Ai dùng | Xác thực | Code |
|---|---|---|---|
| `/api/job-types`, `/api/jobs` | Trang web công cụ | Không (ẩn danh) | `api/src/CongCuFile.Api/Controllers/Web/` |
| `/api/jobs/next`, `/heartbeat`, `/input`, `/complete`, `/fail` | Worker | `X-Worker-Key` | `api/src/CongCuFile.Api/Controllers/Workers/` |
| `/api/admin/...` | App giám sát | `X-Admin-Key` (khác mã worker) | `api/src/CongCuFile.Api/Controllers/Admin/` |
| `/v1/...` | App khách | `Authorization: Bearer <khoá>` | `api/src/CongCuFile.Api/Controllers/V1/` |

Lộ một mã chỉ ảnh hưởng một cửa. Mỗi app khách có khoá riêng (tạo bằng cửa quản trị); database chỉ lưu mã băm
SHA-256 của khoá. Mỗi app khách chỉ thấy file, lô, job của chính nó.

## Đường đi của một lô ảnh qua API v1

1. App khách `POST /v1/uploads {fileName, size}` cho từng file, nhận `uploadUrl` (link có thời hạn 2 giờ).
2. App khách (hoặc trình duyệt của người dùng app đó) `PUT` nội dung file thô lên `uploadUrl`.
3. `POST /v1/batches {type, options, uploadIds, externalId}` kèm header `Idempotency-Key` (gửi lại không tạo trùng).
   API tách thành mỗi file một job (ưu tiên thấp hơn job lẻ của trang web).
4. Worker hỏi việc, tải file, xử lý, gửi kết quả, có tín hiệu sống (giữ job) như mọi job khác.
5. App khách theo dõi `GET /v1/batches/{id}` (đếm chờ/đang chạy/xong/lỗi/đã huỷ, `finished`).
6. `GET /v1/jobs/{id}/result` trả link tải có thời hạn (6 giờ). Hết hạn thì gọi lại để lấy link mới.

"Hợp đồng" này giữ nguyên khi lên production: lúc chạy thử, link tải lên/tải về trỏ về API (`/v1/files/...`,
có chữ ký HMAC); khi có kho S3, link sẽ trỏ thẳng vào kho (presigned URL). App khách không phải sửa.

## Các quyết định chính

- **Worker tự hỏi việc** (pull): máy RTX chỉ cần kết nối ra internet; mất mạng/tắt giữa chừng thì cơ chế giữ
  job (lease 2 phút + tín hiệu sống 30 giây, tối đa 3 lượt) tự giao lại.
- **Kho file là một lớp riêng** (`IFileStore` trong `api/src/CongCuFile.Application/Abstractions/Storage.cs`): code chỉ làm việc với "khoá" (`web/...`,
  `uploads/...`, `results/...`), đổi ổ đĩa ↔ S3 chỉ cần thêm một bản cài đặt.
- **Lô là khái niệm chính cho app khách**; tiến độ lô tính từ trạng thái job, không lưu trùng.
- **Ưu tiên**: job lẻ của trang web (Priority 10) làm trước job trong lô (Priority 0).
- **Ảnh RAW không dùng AI**: RawTherapee (khử nhoè quang học, sửa lỗi ống kính, khử nhiễu) + ExifTool chép
  nguyên metadata gốc, xoá dấu vết phần mềm. Không dùng các mô hình "vẽ lại" (GAN, phục hồi khuôn mặt).

## Lộ trình

| Bước | Nội dung | Trạng thái |
|---|---|---|
| 1 | Khoá app khách, lô, cửa `/v1`, lớp kho file, mã quản trị riêng, ưu tiên, worker ảnh RAW | Đang làm (RAW chờ thử với RawTherapee thật) |
| 2 | Kho kiểu S3 chạy local bằng MinIO; app khách và worker tải file thẳng với kho | |
| 3 | Webhook báo app khách khi lô xong (có chữ ký, gửi lại khi lỗi), chia lượt công bằng giữa các app, ~~tự xoá file cũ~~ (xong 17/11/2026: trang web 2 giờ, app khách 24 giờ), app giám sát xem theo lô | Đang làm |
| 4 | Production: PostgreSQL + EF Core migrations, kho S3 thật (ví dụ Cloudflare R2), HTTPS, tên miền | |
| sau | Cứu ảnh bằng AI trung thực trên GPU (khử nhiễu mạnh, phóng to ×2) có chốt kiểm tra độ trung thực | |
