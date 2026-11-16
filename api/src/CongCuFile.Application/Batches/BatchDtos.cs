using CongCuFile.Domain.Catalog;
using CongCuFile.Domain.Entities;
using CongCuFile.Domain.Enums;

namespace CongCuFile.Application.Batches;

// Yêu cầu tạo lô. Options: giá trị đã đổi về chuỗi (tầng Api đổi số, true/false trong JSON sang chuỗi).
public sealed record CreateBatchRequest(string? Type, Dictionary<string, string?> Options, IReadOnlyList<Guid> UploadIds, string? ExternalId);

public sealed record BatchCountsDto(int Total, int Pending, int Processing, int Done, int Failed, int Cancelled);

public sealed record BatchDto(
    Guid Id, string Type, string Label, string? ExternalId, Dictionary<string, string> Options, DateTime CreatedAt,
    bool Finished, BatchCountsDto Counts, IEnumerable<ClientJobDto> Jobs);

// Một job như app khách nhìn thấy.
public sealed record ClientJobDto(
    Guid Id, Guid? BatchId, Guid? UploadId, string FileName, string Status, string? Error, int Attempts, bool HasResult,
    DateTime CreatedAt, DateTime UpdatedAt)
{
    public static ClientJobDto From(Job j) =>
        new(j.Id, j.BatchId, j.UploadId, j.OriginalName, j.Status.ToString(), j.Error, j.Attempts, j.HasResult, j.CreatedAt, j.UpdatedAt);
}

public sealed record BatchCancelledDto(int Cancelled, BatchDto Batch);

internal static class BatchMapping
{
    public static BatchDto ToDto(Batch batch, List<Job> jobs)
    {
        int Count(JobStatus s) => jobs.Count(j => j.Status == s);
        var counts = new BatchCountsDto(jobs.Count, Count(JobStatus.Pending), Count(JobStatus.Processing),
            Count(JobStatus.Done), Count(JobStatus.Failed), Count(JobStatus.Cancelled));
        var options = System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, string>>(batch.Options) ?? [];
        return new BatchDto(batch.Id, batch.Type, JobCatalog.Label(batch.Type), batch.ExternalId, options, batch.CreatedAt,
            Finished: counts.Pending + counts.Processing == 0, counts, jobs.Select(ClientJobDto.From).ToList());
    }
}
