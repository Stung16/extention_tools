using CongCuFile.Application.Abstractions;
using CongCuFile.Application.Batches;
using CongCuFile.Application.Common;
using CongCuFile.Domain.Jobs;

namespace CongCuFile.Application.ClientJobs;

public sealed record ResultLinkDto(string Url, string FileName, long Size, DateTime ExpiresAt);

// Job của app khách: xem trạng thái, lấy link tải kết quả. Mỗi app chỉ thấy job của chính nó.
public sealed class ClientJobService(IJobRepository jobs, IFileStore store, IClock clock)
{
    private static readonly TimeSpan ResultLinkLife = TimeSpan.FromHours(6);

    public async Task<Result<ClientJobDto>> GetAsync(Guid clientId, Guid id, CancellationToken ct)
    {
        var job = await jobs.FindForClientAsync(id, clientId, ct);
        return job is null ? Error.NotFound("Không tìm thấy job.") : ClientJobDto.From(job);
    }

    // Link tải kết quả, có thời hạn. Hết hạn thì gọi lại để lấy link mới.
    public async Task<Result<ResultLinkDto>> GetResultLinkAsync(Guid clientId, Guid id, string baseUrl, CancellationToken ct)
    {
        var job = await jobs.FindForClientAsync(id, clientId, ct);
        if (job is null) return Error.NotFound("Không tìm thấy job.");
        if (job.FilesDeleted) return Error.Gone(JobPolicy.FilesDeletedMessage);
        if (!job.HasResult) return Error.Conflict($"Job chưa có kết quả (trạng thái: {job.Status}).");
        if (!store.Exists(job.OutputFile!)) return Error.Gone("File kết quả không còn trên máy chủ.");

        var fileName = job.DownloadName();
        var expires = clock.UtcNow.Add(ResultLinkLife);
        return new ResultLinkDto(store.DownloadUrl(baseUrl, job.OutputFile!, fileName, expires), fileName, store.Size(job.OutputFile!), expires);
    }
}
