# Backend (API .NET 10): Clean Architecture

Mở `CongCuFile.sln` bằng Visual Studio / Rider. Chạy:

```
dotnet run --project src/CongCuFile.Api     # API ở http://localhost:5100 (cấu hình dev: appsettings.Development.json)
dotnet test                                 # chạy toàn bộ test (unit + integration)
```

## Bốn tầng và quy tắc phụ thuộc

```
 CongCuFile.Api  ──►  CongCuFile.Application  ──►  CongCuFile.Domain
        │                       ▲
        └──►  CongCuFile.Infrastructure ─┘
```

Mũi tên = "được phép dùng". Tầng trong **không bao giờ** biết tầng ngoài: Domain không biết database, Application
không biết EF Core hay ASP.NET. Nhờ vậy nghiệp vụ test được không cần web, và đổi database/kho file không phải sửa
nghiệp vụ.

| Tầng | Chứa gì | Ví dụ |
|---|---|---|
| **Domain** (`src/CongCuFile.Domain`) | Thực thể, danh mục công cụ, quy tắc thuần. Không phụ thuộc gì | `Entities/Job.cs` (chuyển trạng thái, tên tải về), `Catalog/JobCatalog.cs` (danh sách công cụ), `Jobs/JobOptionsValidator.cs`, `Jobs/JobPolicy.cs` (ưu tiên, số lượt tối đa) |
| **Application** (`src/CongCuFile.Application`) | Nghiệp vụ: mỗi việc một service; các interface mà tầng ngoài phải cài đặt | `Workers/WorkerJobService.cs`, `Batches/BatchService.cs`, `Abstractions/Persistence.cs` (IJobRepository...), `Abstractions/Storage.cs` (IFileStore), `Common/Result.cs` |
| **Infrastructure** (`src/CongCuFile.Infrastructure`) | Cài đặt cụ thể: EF Core + SQLite, kho file trên ổ đĩa, đọc cấu hình | `Persistence/AppDbContext.cs`, `Persistence/Repositories/JobRepository.cs`, `Storage/LocalFileStore.cs`, `DependencyInjection.cs` |
| **Api** (`src/CongCuFile.Api`) | Cửa HTTP: controller mỏng, xác thực, bắt lỗi chung, `Program.cs` | `Controllers/Workers/WorkerJobsController.cs`, `Authentication/`, `Common/ApiControllerBase.cs` |

## Bốn cửa của API

| Cửa | Controller | Xác thực |
|---|---|---|
| Trang web công cụ (`/api/job-types`, `/api/jobs`) | `Controllers/Web/` | Không (ẩn danh) |
| Worker (`/api/jobs/next`, `/heartbeat`, `/input`, `/complete`, `/fail`) | `Controllers/Workers/` | `[Authorize(AuthenticationSchemes = AuthSchemes.Worker)]`, header `X-Worker-Key` |
| Quản trị (`/api/admin/...`) | `Controllers/Admin/` | `AuthSchemes.Admin`, header `X-Admin-Key` |
| App khách (`/v1/...`) | `Controllers/V1/` | `AuthSchemes.ApiKey`, `Authorization: Bearer <khoá>`; Id app: `User.GetClientId()` |

## Một request đi qua các tầng thế nào

Ví dụ worker báo xong (`POST /api/jobs/{id}/complete`):

1. `WorkerJobsController.Complete` đọc form, đổi `IFormFile` thành `IncomingFile`, gọi service.
2. `WorkerJobService.CompleteAsync` kiểm tra lượt, ghi file qua `IFileStore`, gọi `job.MarkDone(...)` (Domain),
   lưu qua `IUnitOfWork`. Trả `Result` (thành công, hoặc `Error.Conflict("...")`).
3. Controller trả `FromResult(result)`: thành công → 200; lỗi → mã HTTP theo loại lỗi, thân `{"error": "..."}`.

## Quy ước

- **Lỗi bình thường trả `Result`, không ném exception.** `return Error.NotFound("Không tìm thấy job.");` hoặc
  `return giaTri;` tự đổi sang `Result<T>`. Loại lỗi → HTTP: Validation 400, NotFound 404, Conflict 409,
  Forbidden 403, Gone 410. Exception chỉ cho lỗi bất ngờ (bắt chung ở `Common/GlobalExceptionHandler.cs` → 500).
- **Controller không chứa nghiệp vụ**, không truy cập database: chỉ đọc request, gọi service, trả `FromResult`.
- **Repository có hàm theo nghiệp vụ** (`TryClaimAsync`, `CancelPendingInBatchAsync`), không có kiểu
  `GetAll/Update` chung chung. Câu `UPDATE` có điều kiện (chống hai worker nhận trùng job) nằm trong repository.
- **Giờ hiện tại lấy từ `IClock`**, không gọi `DateTime.UtcNow` trong nghiệp vụ (test tua được đồng hồ).
- **Tên tiếng Anh, chú thích tiếng Việt.** Định dạng code theo `.editorconfig`; `Directory.Build.props` giữ
  cấu hình chung (net10.0, Nullable, bộ phân tích code). Build phải **0 cảnh báo**.
- **DTO là `record`**, tên thuộc tính chính là tên trường JSON (camelCase). Đổi tên DTO = đổi API, phải sửa
  trang web / worker / app giám sát theo.

## Thêm một việc thường gặp

**Công cụ mới** (ví dụ "Xoay ảnh"): thêm một dòng vào `Domain/Catalog/JobCatalog.cs`, viết handler ở worker
(`worker/handlers/`), thêm vào `web/src/catalog.js`. Backend không phải sửa gì khác.

**Endpoint mới**:
1. Application: thêm hàm vào service phù hợp (hoặc service mới trong thư mục nhóm), trả `Result`.
   Cần database thì thêm hàm vào interface repository (`Abstractions/Persistence.cs`).
2. Infrastructure: cài đặt hàm repository mới (nếu có).
3. Api: thêm action vào controller, gọi service, trả `FromResult(...)`.
4. Service mới thì đăng ký trong `Application/DependencyInjection.cs`.
5. Viết test: quy tắc thuần → `tests/CongCuFile.UnitTests`; hành vi HTTP → `tests/CongCuFile.IntegrationTests`
   (dùng `ApiFactory`, `TestApi`, đồng hồ giả `api.Clock.Advance(...)`).

**Đổi cấu trúc bảng**: sửa thực thể ở Domain (và `Configurations/` nếu cần index). Hiện dùng `EnsureCreated`
(chưa có migrations), nên khi dev phải xoá file `jobs.db`. EF Core migrations sẽ thêm khi lên production.

## Test

- `tests/CongCuFile.UnitTests`: validate tuỳ chọn, tên tải về, quên mật khẩu khi xong, khoá file (chống `..`),
  ký/kiểm tra link, khoá API.
- `tests/CongCuFile.IntegrationTests`: khởi động API thật trong bộ nhớ (database + kho file trong thư mục tạm):
  xác thực từng cửa, vòng đời job, giữ job/giao lại/quá 3 lượt, lô + Idempotency-Key, huỷ, link kết quả hết hạn,
  mỗi app chỉ thấy dữ liệu của mình, ưu tiên job trang web, thao tác quản trị.
- `../tests/smoke_v1.py`: kiểm tra với **worker Python thật** (chạy API trước, xem README gốc).
