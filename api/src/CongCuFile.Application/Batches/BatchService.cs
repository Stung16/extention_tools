using System.Text.Json;
using CongCuFile.Application.Abstractions;
using CongCuFile.Application.Common;
using CongCuFile.Domain.Catalog;
using CongCuFile.Domain.Entities;
using CongCuFile.Domain.Enums;
using CongCuFile.Domain.Jobs;

namespace CongCuFile.Application.Batches;

// Lô của app khách: nhiều file, cùng một loại job và cùng tuỳ chọn; mỗi file thành một job.
public sealed class BatchService(
    IBatchRepository batches, IJobRepository jobs, IUploadRepository uploads, IUnitOfWork unitOfWork, IClock clock)
{
    private const int MaxBatchFiles = 500;
    private const int MaxIdempotencyKeyLength = 100;
    private const int MaxExternalIdLength = 200;

    // Created = false khi trả về lô đã có (gửi lại cùng Idempotency-Key).
    public async Task<Result<(BatchDto Batch, bool Created)>> CreateAsync(
        Guid clientId, CreateBatchRequest request, string? idempotencyKey, CancellationToken ct)
    {
        // Gửi lại cùng Idempotency-Key (ví dụ mạng chập chờn nên app gửi lại) thì trả về lô đã tạo, không tạo thêm.
        idempotencyKey = string.IsNullOrWhiteSpace(idempotencyKey) ? null : idempotencyKey.Trim();
        if (idempotencyKey?.Length > MaxIdempotencyKeyLength)
            return Error.Validation($"Idempotency-Key tối đa {MaxIdempotencyKeyLength} ký tự.");
        if (idempotencyKey is not null && await batches.FindByIdempotencyKeyAsync(clientId, idempotencyKey, ct) is { } existing)
            return (await ToDtoAsync(existing, ct), false);

        if (request.Type is null || !JobCatalog.TryGet(request.Type, out var jobType))
            return Error.Validation($"Không hỗ trợ loại job '{request.Type}'. Xem danh sách ở GET /v1/job-types.");
        if (jobType.Input != "file")
            return Error.Validation("Qua API v1 hiện chỉ dùng được các công cụ nhận file.");

        var ids = request.UploadIds.Distinct().ToList();
        if (ids.Count == 0) return Error.Validation("Cần ít nhất một file (uploadIds).");
        if (ids.Count > MaxBatchFiles) return Error.Validation($"Mỗi lô tối đa {MaxBatchFiles} file.");

        var found = await uploads.FindForClientAsync(clientId, ids, ct);
        foreach (var id in ids)
        {
            if (!found.TryGetValue(id, out var u)) return Error.Validation($"Không tìm thấy file {id}.");
            if (u.Status == UploadStatus.Expired)
                return Error.Validation($"File {u.FileName} đã được tự động xoá vì hết thời gian lưu. Hãy tải lên lại.");
            if (u.Status != UploadStatus.Uploaded) return Error.Validation($"File {u.FileName} chưa tải lên xong.");
            if (!jobType.Extensions.Contains(u.Ext))
                return Error.Validation($"File {u.FileName}: công cụ này chỉ nhận {string.Join(", ", jobType.Extensions)}.");
        }

        var (options, error) = JobOptionsValidator.Validate(jobType, name => request.Options.GetValueOrDefault(name));
        if (error is not null) return Error.Validation(error);

        var now = clock.UtcNow;
        var externalId = request.ExternalId?.Trim();
        var batch = new Batch
        {
            Id = Guid.NewGuid(), ClientId = clientId, Type = request.Type, Options = JsonSerializer.Serialize(options),
            ExternalId = string.IsNullOrEmpty(externalId) ? null : externalId[..Math.Min(externalId.Length, MaxExternalIdLength)],
            IdempotencyKey = idempotencyKey, CreatedAt = now,
        };
        batches.Add(batch);

        for (var i = 0; i < ids.Count; i++)
        {
            var u = found[ids[i]];
            jobs.Add(new Job
            {
                Id = Guid.NewGuid(), Type = request.Type, Status = JobStatus.Pending, OriginalName = u.FileName,
                InputFile = u.StorageKey, Options = batch.Options, ClientId = clientId, BatchId = batch.Id, UploadId = u.Id,
                Priority = JobPolicy.BatchPriority,
                // Cộng thêm vài tick để giữ đúng thứ tự file app khách gửi (worker nhận theo CreatedAt).
                CreatedAt = now.AddTicks(i), UpdatedAt = now,
            });
        }

        try
        {
            await unitOfWork.SaveChangesAsync(ct);
        }
        catch (UniqueConstraintException) when (idempotencyKey is not null)
        {
            // Hai yêu cầu cùng Idempotency-Key tới cùng lúc: yêu cầu kia đã tạo lô trước.
            unitOfWork.DiscardChanges();
            if (await batches.FindByIdempotencyKeyAsync(clientId, idempotencyKey, ct) is { } other)
                return (await ToDtoAsync(other, ct), false);
            throw;
        }

        return (await ToDtoAsync(batch, ct), true);
    }

    public async Task<Result<BatchDto>> GetAsync(Guid clientId, Guid id, CancellationToken ct)
    {
        var batch = await batches.FindForClientAsync(id, clientId, ct);
        return batch is null ? Error.NotFound("Không tìm thấy lô.") : await ToDtoAsync(batch, ct);
    }

    // Huỷ các job còn đang chờ trong lô. Job đang chạy vẫn chạy tiếp tới khi xong.
    public async Task<Result<BatchCancelledDto>> CancelAsync(Guid clientId, Guid id, CancellationToken ct)
    {
        var batch = await batches.FindForClientAsync(id, clientId, ct);
        if (batch is null) return Error.NotFound("Không tìm thấy lô.");
        var cancelled = await jobs.CancelPendingInBatchAsync(id, "Đã huỷ theo yêu cầu của ứng dụng.", clock.UtcNow, ct);
        return new BatchCancelledDto(cancelled, await ToDtoAsync(batch, ct));
    }

    private async Task<BatchDto> ToDtoAsync(Batch batch, CancellationToken ct) =>
        BatchMapping.ToDto(batch, await jobs.ListByBatchAsync(batch.Id, ct));
}
