using CongCuFile.Application.Abstractions;
using CongCuFile.Domain.Entities;
using CongCuFile.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace CongCuFile.Infrastructure.Persistence.Repositories;

internal sealed class JobRepository(AppDbContext db) : IJobRepository
{
    public void Add(Job job) => db.Jobs.Add(job);

    public Task<Job?> FindAsync(Guid id, CancellationToken ct) => db.Jobs.FirstOrDefaultAsync(j => j.Id == id, ct);

    public Task<Job?> FindForClientAsync(Guid id, Guid clientId, CancellationToken ct) =>
        db.Jobs.AsNoTracking().FirstOrDefaultAsync(j => j.Id == id && j.ClientId == clientId, ct);

    public Task<List<Job>> ListByBatchAsync(Guid batchId, CancellationToken ct) =>
        db.Jobs.AsNoTracking().Where(j => j.BatchId == batchId).OrderBy(j => j.CreatedAt).ToListAsync(ct);

    public Task<Job?> NextPendingAsync(IReadOnlyCollection<string> types, CancellationToken ct)
    {
        var query = db.Jobs.AsNoTracking().Where(j => j.Status == JobStatus.Pending);
        if (types.Count > 0) query = query.Where(j => types.Contains(j.Type));
        return query.OrderByDescending(j => j.Priority).ThenBy(j => j.CreatedAt).FirstOrDefaultAsync(ct);
    }

    // Điều kiện nằm ngay trong câu lệnh UPDATE: hai worker hỏi cùng lúc thì chỉ một bên đổi được (1 dòng).
    public async Task<bool> TryClaimAsync(Guid jobId, int expectedAttempts, DateTime leaseUntil, DateTime now, CancellationToken ct) =>
        await db.Jobs
            .Where(j => j.Id == jobId && j.Status == JobStatus.Pending && j.Attempts == expectedAttempts)
            .ExecuteUpdateAsync(s => s
                .SetProperty(j => j.Status, JobStatus.Processing)
                .SetProperty(j => j.Attempts, expectedAttempts + 1)
                .SetProperty(j => j.LeaseUntil, leaseUntil)
                .SetProperty(j => j.UpdatedAt, now), ct) == 1;

    public async Task<bool> RenewLeaseAsync(Guid jobId, int attempt, DateTime leaseUntil, CancellationToken ct) =>
        await db.Jobs
            .Where(j => j.Id == jobId && j.Status == JobStatus.Processing && j.Attempts == attempt)
            .ExecuteUpdateAsync(s => s.SetProperty(j => j.LeaseUntil, leaseUntil), ct) == 1;

    // Còn lượt thì trả về hàng chờ. Nếu worker vừa kịp gia hạn thì điều kiện LeaseUntil < now không còn đúng,
    // job không bị trả về nhầm.
    public Task RequeueExpiredAsync(DateTime now, int maxAttempts, CancellationToken ct) =>
        db.Jobs
            .Where(j => j.Status == JobStatus.Processing && j.LeaseUntil < now && j.Attempts < maxAttempts)
            .ExecuteUpdateAsync(s => s
                .SetProperty(j => j.Status, JobStatus.Pending)
                .SetProperty(j => j.LeaseUntil, (DateTime?)null)
                .SetProperty(j => j.UpdatedAt, now), ct);

    public Task<List<Job>> ListExpiredAsync(DateTime now, CancellationToken ct) =>
        db.Jobs.Where(j => j.Status == JobStatus.Processing && j.LeaseUntil < now).ToListAsync(ct);

    public async Task<bool> CancelPendingAsync(Guid jobId, string reason, DateTime now, CancellationToken ct) =>
        await CancelPending(db.Jobs.Where(j => j.Id == jobId), reason, now, ct) == 1;

    public Task<int> CancelPendingInBatchAsync(Guid batchId, string reason, DateTime now, CancellationToken ct) =>
        CancelPending(db.Jobs.Where(j => j.BatchId == batchId), reason, now, ct);

    private static Task<int> CancelPending(IQueryable<Job> query, string reason, DateTime now, CancellationToken ct) =>
        query.Where(j => j.Status == JobStatus.Pending)
            .ExecuteUpdateAsync(s => s
                .SetProperty(j => j.Status, JobStatus.Cancelled)
                .SetProperty(j => j.Error, reason)
                .SetProperty(j => j.UpdatedAt, now), ct);

    public Task<Dictionary<JobStatus, int>> CountByStatusAsync(CancellationToken ct) =>
        db.Jobs.GroupBy(j => j.Status).Select(g => new { g.Key, Count = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.Count, ct);

    // Theo đúng thứ tự worker sẽ nhận.
    public Task<List<Job>> ListActiveAsync(CancellationToken ct) =>
        db.Jobs.AsNoTracking()
            .Where(j => j.Status == JobStatus.Pending || j.Status == JobStatus.Processing)
            .OrderByDescending(j => j.Priority).ThenBy(j => j.CreatedAt)
            .ToListAsync(ct);

    public Task<List<Job>> ListFinishedSinceAsync(DateTime since, CancellationToken ct) =>
        db.Jobs.AsNoTracking()
            .Where(j => (j.Status == JobStatus.Done || j.Status == JobStatus.Failed || j.Status == JobStatus.Cancelled) && j.UpdatedAt >= since)
            .OrderByDescending(j => j.UpdatedAt)
            .ToListAsync(ct);
}
