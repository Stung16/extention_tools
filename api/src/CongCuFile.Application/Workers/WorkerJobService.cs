using CongCuFile.Application.Abstractions;
using CongCuFile.Application.Common;
using CongCuFile.Application.Storage;
using CongCuFile.Domain.Catalog;
using CongCuFile.Domain.Enums;
using CongCuFile.Domain.Jobs;

namespace CongCuFile.Application.Workers;

// Job giao cho worker.
public sealed record ClaimedJobDto(Guid Id, string Type, string OriginalName, string Input, int Attempt, Dictionary<string, string> Options);

// Nghiệp vụ phía worker: nhận việc, gia hạn giữ job, lấy file đầu vào, báo xong, báo lỗi.
//
// Giữ job (lease): khi nhận, job được giữ LeaseTime (2 phút); worker gửi tín hiệu sống để gia hạn.
// Worker chết (mất điện, bị tắt) thì hết hạn, lần tới có worker hỏi việc, job được trả về hàng chờ.
// Mỗi lần nhận tăng số lượt (Attempts); worker gửi kèm số lượt khi báo kết quả để lượt cũ không ghi đè lượt mới.
public sealed class WorkerJobService(
    IJobRepository jobs, IUnitOfWork unitOfWork, IFileStore store, WorkerPresence presence, JobLeaseSettings lease, IClock clock)
{
    private static Error NotCurrentAttempt(int attempt, JobStatus status, int currentAttempts) =>
        Error.Conflict($"Job không còn thuộc lượt {attempt} (đang là {status}, lượt {currentAttempts}).");

    // Worker hỏi "có job nào không?" với danh sách loại job nó làm được. Không có việc thì trả null.
    public async Task<ClaimedJobDto?> ClaimNextAsync(IReadOnlyCollection<string> types, CancellationToken ct)
    {
        presence.MarkSeen(types);
        await RecoverAbandonedAsync(ct);

        var job = await jobs.NextPendingAsync(types, ct);
        if (job is null) return null;

        var now = clock.UtcNow;
        var attempt = job.Attempts + 1;
        if (!await jobs.TryClaimAsync(job.Id, job.Attempts, now.Add(lease.LeaseTime), now, ct))
            return null; // worker khác vừa nhận mất

        return new ClaimedJobDto(job.Id, job.Type, job.OriginalName, JobCatalog.InputOf(job.Type), attempt, job.ReadOptions());
    }

    // Tìm job "đang xử lý" đã quá hạn giữ (worker không còn gửi tín hiệu sống) và xử lý lại.
    // Gọi mỗi khi có worker hỏi việc: job bị bỏ rơi chỉ có ý nghĩa khi có worker sẵn sàng làm lại.
    private async Task RecoverAbandonedAsync(CancellationToken ct)
    {
        var now = clock.UtcNow;
        await jobs.RequeueExpiredAsync(now, JobPolicy.MaxAttempts, ct);

        // Còn lại là các job đã hết lượt: báo lỗi cho người dùng.
        var dead = await jobs.ListExpiredAsync(now, ct);
        foreach (var job in dead)
            job.MarkFailed(JobPolicy.AbandonedError(job.Attempts), now);
        if (dead.Count > 0) await unitOfWork.SaveChangesAsync(ct);
    }

    public async Task<Result> HeartbeatAsync(Guid id, int attempt, CancellationToken ct) =>
        await jobs.RenewLeaseAsync(id, attempt, clock.UtcNow.Add(lease.LeaseTime), ct)
            ? Result.Success()
            : Error.Conflict("Job không còn thuộc lượt xử lý này.");

    public async Task<Result<FileDownload>> OpenInputAsync(Guid id, CancellationToken ct)
    {
        var job = await jobs.FindAsync(id, ct);
        if (job is null || job.InputFile == "" || !store.Exists(job.InputFile))
            return Error.NotFound("Không tìm thấy file đầu vào.");
        return new FileDownload(store.OpenRead(job.InputFile), job.OriginalName);
    }

    // Worker báo xong, gửi kèm file kết quả. name: tên kết quả do worker đặt (cho job dạng đường link).
    public async Task<Result> CompleteAsync(Guid id, int? attempt, IncomingFile? file, string? name, CancellationToken ct)
    {
        var job = await jobs.FindAsync(id, ct);
        if (job is null) return Error.NotFound("Không tìm thấy job.");
        if (attempt is null) return Error.Validation("Thiếu số lượt (attempt).");
        if (job.Status != JobStatus.Processing || job.Attempts != attempt)
            return NotCurrentAttempt(attempt.Value, job.Status, job.Attempts);
        if (file is null || file.Length == 0) return Error.Validation("Thiếu file kết quả.");

        var outputKey = FileKeys.Result(job.Id, FileKeys.SafeExt(file.FileName));
        await using (var output = store.OpenWrite(outputKey))
        {
            await file.Content.CopyToAsync(output, ct);
        }

        // Job dạng đường link không có tên file gốc: lấy tên worker đặt cho kết quả (ví dụ tên video YouTube).
        if (job.InputFile == "" && !string.IsNullOrEmpty(name))
        {
            var safeName = Path.GetFileName(name);
            job.OriginalName = safeName[..Math.Min(safeName.Length, 120)];
        }

        job.MarkDone(outputKey, clock.UtcNow);
        await unitOfWork.SaveChangesAsync(ct);
        return Result.Success();
    }

    public async Task<Result> FailAsync(Guid id, string error, int attempt, CancellationToken ct)
    {
        var job = await jobs.FindAsync(id, ct);
        if (job is null) return Error.NotFound("Không tìm thấy job.");
        // Chỉ nhận từ đúng lượt đang xử lý, không ghi đè job đã xong.
        if (job.Status != JobStatus.Processing || job.Attempts != attempt)
            return NotCurrentAttempt(attempt, job.Status, job.Attempts);

        job.MarkFailed(error, clock.UtcNow);
        await unitOfWork.SaveChangesAsync(ct);
        return Result.Success();
    }
}
