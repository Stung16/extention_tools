using CongCuFile.Application.Workers;
using CongCuFile.Domain.Catalog;

namespace CongCuFile.Application.Jobs;

// Một công cụ, như trang web công cụ cần để hiện ô chọn file và các tuỳ chọn.
public sealed record JobTypeDto(
    string Type, string Label, string[] Extensions, JobOption[] Options, string Worker, string Input, string? UrlPattern, bool Online);

// Một công cụ, như app khách (API v1) cần.
public sealed record ClientJobTypeDto(string Type, string Label, string[] Extensions, JobOption[] Options);

// Danh sách công cụ (đọc từ JobCatalog).
public sealed class JobTypeQueries(WorkerPresence presence)
{
    public IEnumerable<JobTypeDto> ForWebsite() =>
        JobCatalog.Types.Select(t => new JobTypeDto(
            t.Key, t.Value.Label, t.Value.Extensions, t.Value.Options, t.Value.Worker, t.Value.Input, t.Value.UrlPattern,
            presence.IsOnline(t.Key)));

    // API v1 hiện chỉ dùng được các công cụ nhận file.
    public static IEnumerable<ClientJobTypeDto> ForClients() =>
        JobCatalog.Types.Where(t => t.Value.Input == "file")
            .Select(t => new ClientJobTypeDto(t.Key, t.Value.Label, t.Value.Extensions, t.Value.Options));
}
