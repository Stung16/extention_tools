using CongCuFile.Application.Abstractions;
using CongCuFile.Application.Common;
using CongCuFile.Application.Workers;
using CongCuFile.Domain.Catalog;
using CongCuFile.Domain.Entities;
using CongCuFile.Domain.Enums;

namespace CongCuFile.Application.Admin;

// Tính số liệu tổng quan cho app giám sát.
public sealed class OverviewService(
    IJobRepository jobs, IApiClientRepository clients, IFileStore store, WorkerPresence presence, IClock clock)
{
    private const string WebSource = "Trang web";
    private const int MaxWaitingShown = 50;
    private const int MaxRecentShown = 100;

    public async Task<OverviewDto> GetAsync(CancellationToken ct)
    {
        var now = clock.UtcNow;
        var clientNames = await clients.NamesAsync(ct);
        var totals = await jobs.CountByStatusAsync(ct);
        var active = await jobs.ListActiveAsync(ct);                       // đang chờ + đang xử lý
        var finished = await jobs.ListFinishedSinceAsync(now.AddHours(-24), ct); // kết thúc trong 24 giờ

        var pending = active.Where(j => j.Status == JobStatus.Pending).ToList();
        var processing = active.Where(j => j.Status == JobStatus.Processing).ToList();
        var done = finished.Where(j => j.Status == JobStatus.Done).ToList();

        string Source(Job j) => j.ClientId is null ? WebSource : clientNames.GetValueOrDefault(j.ClientId.Value, "App đã xoá");
        double Since(DateTime from) => Seconds(from, now);
        int Total(JobStatus s) => totals.GetValueOrDefault(s);

        // Mỗi nhóm worker ("main", "ai", "photo"): bật nếu có loại job nào của nhóm vừa được hỏi tới.
        var workers = JobCatalog.Types.GroupBy(t => t.Value.Worker).Select(g =>
        {
            var seen = g.Select(t => presence.LastSeen(t.Key)).Max();
            return new WorkerGroupDto(
                g.Key,
                g.Any(t => presence.IsOnline(t.Key)),
                seen is null ? null : Round(Since(seen.Value)),
                g.Count(),
                pending.Count(j => JobCatalog.WorkerOf(j.Type) == g.Key),
                processing.Count(j => JobCatalog.WorkerOf(j.Type) == g.Key));
        }).ToList();

        var types = JobCatalog.Types.Select(t => new JobTypeStatsDto(
            t.Key, t.Value.Label, t.Value.Worker, presence.IsOnline(t.Key),
            pending.Count(j => j.Type == t.Key),
            processing.Count(j => j.Type == t.Key),
            done.Count(j => j.Type == t.Key),
            finished.Count(j => j.Type == t.Key && j.Status == JobStatus.Failed),
            Average(done.Where(j => j.Type == t.Key)))).ToList();

        // Lúc worker nhận job, UpdatedAt được đặt lại (tín hiệu sống không đổi cột này),
        // nên now - UpdatedAt là thời gian đã xử lý ở lượt hiện tại.
        var running = processing.Select(j => new RunningJobDto(
            j.Id, j.Type, JobCatalog.Label(j.Type), JobCatalog.WorkerOf(j.Type), j.OriginalName, Source(j), j.BatchId,
            j.Attempts, Round(Since(j.UpdatedAt)), j.LeaseUntil is null ? null : Round((j.LeaseUntil.Value - now).TotalSeconds))).ToList();

        // Hàng chờ theo đúng thứ tự worker sẽ nhận (ưu tiên trước, rồi ai đến trước).
        var waiting = pending.Take(MaxWaitingShown).Select(j => new WaitingJobDto(
            j.Id, j.Type, JobCatalog.Label(j.Type), JobCatalog.WorkerOf(j.Type), j.OriginalName, Source(j), j.BatchId,
            j.Attempts, Round(Since(j.CreatedAt)))).ToList();

        var recent = finished.Take(MaxRecentShown).Select(j => new RecentJobDto(
            j.Id, j.Type, JobCatalog.Label(j.Type), JobCatalog.WorkerOf(j.Type), j.OriginalName, Source(j), j.BatchId,
            j.Status.ToString(), j.Attempts, j.Error, Round(Seconds(j.CreatedAt, j.UpdatedAt)), Round(Since(j.UpdatedAt)))).ToList();

        var (files, bytes) = store.Usage();

        return new OverviewDto(
            now,
            new StatusTotalsDto(Total(JobStatus.Pending), Total(JobStatus.Processing), Total(JobStatus.Done),
                Total(JobStatus.Failed), Total(JobStatus.Cancelled)),
            new Last24hDto(done.Count, finished.Count(j => j.Status == JobStatus.Failed),
                finished.Count(j => j.Status == JobStatus.Cancelled), Average(done)),
            pending.Count == 0 ? null : Round(Since(pending.Min(j => j.CreatedAt))),
            workers, types, running, waiting, recent,
            new StorageUsageDto(files, bytes));
    }

    private static double Seconds(DateTime from, DateTime to) => Math.Max(0, (to - from).TotalSeconds);
    private static double Round(double seconds) => Math.Round(seconds, 1);

    private static double? Average(IEnumerable<Job> doneJobs)
    {
        var durations = doneJobs.Select(j => Seconds(j.CreatedAt, j.UpdatedAt)).ToList();
        return durations.Count == 0 ? null : Round(durations.Average());
    }
}
