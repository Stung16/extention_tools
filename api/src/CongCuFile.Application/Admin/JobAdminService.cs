using CongCuFile.Application.Abstractions;
using CongCuFile.Application.Common;
using CongCuFile.Domain.Jobs;

namespace CongCuFile.Application.Admin;

// Người quản lý thao tác với job từ app giám sát.
public sealed class JobAdminService(IJobRepository jobs, IUnitOfWork unitOfWork, IFileStore store, IClock clock)
{
    // Thử lại job lỗi hoặc đã huỷ: đưa về cuối hàng chờ, đếm lượt lại từ đầu. File đầu vào vẫn còn trong kho.
    // (Mật khẩu của công cụ đặt/gỡ mật khẩu đã bị xoá khi job kết thúc, nên job loại đó thử lại sẽ thiếu mật khẩu.)
    public async Task<Result> RetryAsync(Guid id, CancellationToken ct)
    {
        var job = await jobs.FindAsync(id, ct);
        if (job is null) return Error.NotFound("Không tìm thấy job.");
        if (!JobPolicy.CanRetry(job.Status)) return Error.Conflict("Chỉ thử lại được job đang lỗi hoặc đã huỷ.");
        if (job.InputFile != "" && !store.Exists(job.InputFile))
            return Error.Conflict("File gốc của job này không còn trên máy chủ.");

        job.ResetForRetry(clock.UtcNow);
        await unitOfWork.SaveChangesAsync(ct);
        return Result.Success();
    }

    // Huỷ job đang chờ. Job đang chạy thì không huỷ được (worker không có cách dừng giữa chừng).
    public async Task<Result> CancelAsync(Guid id, CancellationToken ct) =>
        await jobs.CancelPendingAsync(id, "Đã bị huỷ bởi người quản lý máy chủ.", clock.UtcNow, ct)
            ? Result.Success()
            : Error.Conflict("Chỉ huỷ được job đang chờ.");
}
