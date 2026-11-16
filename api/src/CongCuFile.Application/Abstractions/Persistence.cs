using CongCuFile.Domain.Entities;
using CongCuFile.Domain.Enums;

namespace CongCuFile.Application.Abstractions;

// Các interface truy cập dữ liệu. Tầng Infrastructure cài đặt bằng EF Core + SQLite;
// nghiệp vụ chỉ biết các hàm dưới đây, không biết database là gì.
// Mỗi hàm mang đúng ý nghĩa nghiệp vụ (không có repository "chung chung" kiểu GetAll/Update).

// Lưu mọi thay đổi trên các thực thể đã nạp/thêm trong một lần.
public interface IUnitOfWork
{
    // Ném UniqueConstraintException khi trùng khoá duy nhất.
    Task SaveChangesAsync(CancellationToken ct = default);

    // Bỏ mọi thay đổi đang chờ lưu (dùng sau khi SaveChanges thất bại).
    void DiscardChanges();
}

public interface IJobRepository
{
    void Add(Job job);
    Task<Job?> FindAsync(Guid id, CancellationToken ct = default);
    Task<Job?> FindForClientAsync(Guid id, Guid clientId, CancellationToken ct = default);
    Task<List<Job>> ListByBatchAsync(Guid batchId, CancellationToken ct = default);

    // Job đang chờ được làm tiếp theo: ưu tiên cao trước, cùng ưu tiên thì ai đến trước.
    Task<Job?> NextPendingAsync(IReadOnlyCollection<string> types, CancellationToken ct = default);

    // Nhận job: chỉ thành công khi job VẪN đang chờ và chưa ai nhận lượt này
    // (hai worker hỏi cùng lúc thì chỉ một bên nhận được).
    Task<bool> TryClaimAsync(Guid jobId, int expectedAttempts, DateTime leaseUntil, DateTime now, CancellationToken ct = default);

    // Gia hạn giữ job, chỉ khi job còn đang xử lý ở đúng lượt này.
    Task<bool> RenewLeaseAsync(Guid jobId, int attempt, DateTime leaseUntil, CancellationToken ct = default);

    // Job "đang xử lý" quá hạn giữ: còn lượt thì trả về hàng chờ; trả về danh sách job đã hết lượt (để báo lỗi).
    Task RequeueExpiredAsync(DateTime now, int maxAttempts, CancellationToken ct = default);
    Task<List<Job>> ListExpiredAsync(DateTime now, CancellationToken ct = default);

    // Huỷ job đang chờ (một job, hoặc mọi job đang chờ trong một lô). Trả về số job đã huỷ.
    Task<bool> CancelPendingAsync(Guid jobId, string reason, DateTime now, CancellationToken ct = default);
    Task<int> CancelPendingInBatchAsync(Guid batchId, string reason, DateTime now, CancellationToken ct = default);

    // Cho trang tổng quan.
    Task<Dictionary<JobStatus, int>> CountByStatusAsync(CancellationToken ct = default);
    Task<List<Job>> ListActiveAsync(CancellationToken ct = default);
    Task<List<Job>> ListFinishedSinceAsync(DateTime since, CancellationToken ct = default);
}

public interface IBatchRepository
{
    void Add(Batch batch);
    Task<Batch?> FindForClientAsync(Guid id, Guid clientId, CancellationToken ct = default);
    Task<Batch?> FindByIdempotencyKeyAsync(Guid clientId, string key, CancellationToken ct = default);
}

public interface IUploadRepository
{
    void Add(Upload upload);
    Task<Upload?> FindByStorageKeyAsync(string storageKey, CancellationToken ct = default);
    Task<Dictionary<Guid, Upload>> FindForClientAsync(Guid clientId, IReadOnlyCollection<Guid> ids, CancellationToken ct = default);
}

public interface IApiClientRepository
{
    void Add(ApiClient client);
    Task<ApiClient?> FindByKeyHashAsync(string keyHash, CancellationToken ct = default);
    Task<List<ApiClient>> ListAsync(CancellationToken ct = default);
    Task<Dictionary<Guid, string>> NamesAsync(CancellationToken ct = default);
    Task<bool> DisableAsync(Guid id, CancellationToken ct = default);
}
