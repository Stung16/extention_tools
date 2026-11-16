using Api.Storage;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

// Cửa quản trị cho app giám sát (monitor/). Phải gửi kèm header X-Admin-Key (khác mã của worker).
public static class AdminEndpoints
{
    public record NewClientRequest(string? Name);

    const string WebSource = "Trang web";

    public static void MapAdminEndpoints(this WebApplication app)
    {
        var admin = app.MapGroup("/api/admin").RequireSecretHeader("X-Admin-Key", s => s.AdminKey);

        admin.MapGet("/overview", Overview);

        // Thử lại job lỗi hoặc đã huỷ: đưa về hàng chờ, đếm lượt lại từ đầu. File đầu vào vẫn còn trong kho.
        // (Mật khẩu của công cụ đặt/gỡ mật khẩu đã bị xoá khi job kết thúc, nên job loại đó thử lại sẽ thiếu mật khẩu.)
        admin.MapPost("/jobs/{id:guid}/retry", async (Guid id, AppDb db, IFileStore store) =>
        {
            var job = await db.Jobs.FindAsync(id);
            if (job is null) return Results.NotFound();
            if (job.Status is not (JobStatus.Failed or JobStatus.Cancelled))
                return Results.Conflict(new { error = "Chỉ thử lại được job đang lỗi hoặc đã huỷ." });
            if (job.InputFile != "" && !store.Exists(job.InputFile))
                return Results.Conflict(new { error = "File gốc của job này không còn trên máy chủ." });

            job.Status = JobStatus.Pending;
            job.Error = null;
            job.Attempts = 0;
            job.LeaseUntil = null;
            job.CreatedAt = DateTime.UtcNow; // xếp lại vào cuối hàng, tính thời gian chờ từ bây giờ
            job.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok();
        });

        // Huỷ job đang chờ. Job đang chạy thì không huỷ được (worker không có cách dừng giữa chừng).
        admin.MapPost("/jobs/{id:guid}/cancel", async (Guid id, AppDb db) =>
        {
            var now = DateTime.UtcNow;
            var changed = await db.Jobs
                .Where(j => j.Id == id && j.Status == JobStatus.Pending)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(j => j.Status, JobStatus.Cancelled)
                    .SetProperty(j => j.Error, "Đã bị huỷ bởi người quản lý máy chủ.")
                    .SetProperty(j => j.UpdatedAt, now));
            return changed == 1 ? Results.Ok() : Results.Conflict(new { error = "Chỉ huỷ được job đang chờ." });
        });

        // ----- App khách (dùng API v1) -----

        // Tạo app khách mới. Khoá API chỉ trả về MỘT LẦN ở đây; mất thì tạo khoá mới.
        admin.MapPost("/clients", async (NewClientRequest body, AppDb db) =>
        {
            var name = (body.Name ?? "").Trim();
            if (name == "" || name.Length > 100) return Results.BadRequest(new { error = "Tên app phải có từ 1 tới 100 ký tự." });
            var key = ApiKeys.Generate();
            var client = new ApiClient
            {
                Id = Guid.NewGuid(), Name = name, KeyPrefix = key[..10], KeyHash = ApiKeys.Hash(key), CreatedAt = DateTime.UtcNow,
            };
            db.ApiClients.Add(client);
            await db.SaveChangesAsync();
            return Results.Created($"/api/admin/clients/{client.Id}", new { client.Id, client.Name, client.KeyPrefix, Key = key });
        });

        admin.MapGet("/clients", async (AppDb db) =>
            await db.ApiClients.AsNoTracking().OrderBy(c => c.CreatedAt)
                .Select(c => new { c.Id, c.Name, c.KeyPrefix, c.CreatedAt, c.Disabled })
                .ToListAsync());

        // Khoá app khách (khoá API không dùng được nữa). Job đã tạo vẫn chạy tiếp.
        admin.MapPost("/clients/{id:guid}/disable", async (Guid id, AppDb db) =>
        {
            var changed = await db.ApiClients.Where(c => c.Id == id)
                .ExecuteUpdateAsync(s => s.SetProperty(c => c.Disabled, true));
            return changed == 1 ? Results.Ok() : Results.NotFound();
        });
    }

    // Số liệu tổng quan cho app giám sát.
    static async Task<IResult> Overview(AppDb db, IFileStore store, JobRuntime runtime)
    {
        var now = DateTime.UtcNow;
        var since = now.AddHours(-24);
        double Seconds(DateTime from, DateTime to) => Math.Max(0, (to - from).TotalSeconds);
        double? Avg(IEnumerable<double> xs) { var l = xs.ToList(); return l.Count == 0 ? null : Math.Round(l.Average(), 1); }

        var clients = await db.ApiClients.AsNoTracking().ToDictionaryAsync(c => c.Id, c => c.Name);
        string Source(Guid? clientId) => clientId is null ? WebSource : clients.GetValueOrDefault(clientId.Value, "App đã xoá");

        var totals = await db.Jobs.GroupBy(j => j.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Status, x => x.Count);
        int Total(JobStatus s) => totals.GetValueOrDefault(s);

        // Job đang chờ / đang xử lý, và job kết thúc trong 24 giờ qua (số lượng nhỏ, tính tiếp trong bộ nhớ).
        var active = await db.Jobs
            .Where(j => j.Status == JobStatus.Pending || j.Status == JobStatus.Processing)
            .OrderByDescending(j => j.Priority).ThenBy(j => j.CreatedAt)
            .Select(j => new { j.Id, j.Type, j.Status, j.OriginalName, j.Attempts, j.CreatedAt, j.UpdatedAt, j.LeaseUntil, j.ClientId, j.BatchId })
            .ToListAsync();
        var finished = await db.Jobs
            .Where(j => (j.Status == JobStatus.Done || j.Status == JobStatus.Failed || j.Status == JobStatus.Cancelled) && j.UpdatedAt >= since)
            .OrderByDescending(j => j.UpdatedAt)
            .Select(j => new { j.Id, j.Type, j.Status, j.OriginalName, j.Attempts, j.Error, j.CreatedAt, j.UpdatedAt, j.ClientId, j.BatchId })
            .ToListAsync();

        var pending = active.Where(j => j.Status == JobStatus.Pending).ToList();
        var processing = active.Where(j => j.Status == JobStatus.Processing).ToList();
        var done24 = finished.Where(j => j.Status == JobStatus.Done).ToList();
        var oldestPending = pending.Count == 0 ? (DateTime?)null : pending.Min(j => j.CreatedAt);

        // Mỗi nhóm worker ("main", "ai", "photo"): bật nếu có loại job nào của nhóm vừa được hỏi tới.
        var workers = JobCatalog.Types.GroupBy(t => t.Value.Worker).Select(g =>
        {
            var seen = g.Select(t => runtime.LastSeen(t.Key)).Max();
            return new
            {
                Name = g.Key,
                Online = g.Any(t => runtime.IsOnline(t.Key)),
                LastSeenSecondsAgo = seen is null ? (double?)null : Math.Round(Seconds(seen.Value, now), 1),
                Types = g.Count(),
                Pending = pending.Count(j => JobHelpers.WorkerOf(j.Type) == g.Key),
                Processing = processing.Count(j => JobHelpers.WorkerOf(j.Type) == g.Key),
            };
        });

        var types = JobCatalog.Types.Select(t => new
        {
            Type = t.Key,
            t.Value.Label,
            t.Value.Worker,
            Online = runtime.IsOnline(t.Key),
            Pending = pending.Count(j => j.Type == t.Key),
            Processing = processing.Count(j => j.Type == t.Key),
            Done24h = done24.Count(j => j.Type == t.Key),
            Failed24h = finished.Count(j => j.Type == t.Key && j.Status == JobStatus.Failed),
            AvgSeconds24h = Avg(done24.Where(j => j.Type == t.Key).Select(j => Seconds(j.CreatedAt, j.UpdatedAt))),
        });

        var (files, bytes) = store.Usage();

        return Results.Ok(new
        {
            ServerTime = now,
            Totals = new
            {
                Pending = Total(JobStatus.Pending), Processing = Total(JobStatus.Processing),
                Done = Total(JobStatus.Done), Failed = Total(JobStatus.Failed), Cancelled = Total(JobStatus.Cancelled),
            },
            Last24h = new
            {
                Done = done24.Count,
                Failed = finished.Count(j => j.Status == JobStatus.Failed),
                Cancelled = finished.Count(j => j.Status == JobStatus.Cancelled),
                // Thời gian "từ lúc gửi tới lúc xong" (gồm cả thời gian chờ trong hàng): đúng thứ người dùng cảm nhận.
                AvgSeconds = Avg(done24.Select(j => Seconds(j.CreatedAt, j.UpdatedAt))),
            },
            OldestPendingSeconds = oldestPending is null ? (double?)null : Math.Round(Seconds(oldestPending.Value, now), 1),
            Workers = workers,
            Types = types,
            // Lúc worker nhận job, UpdatedAt được đặt lại (tín hiệu sống không đổi cột này), nên now - UpdatedAt
            // là thời gian đã xử lý ở lượt hiện tại.
            Running = processing.Select(j => new
            {
                j.Id, j.Type, Label = JobHelpers.Label(j.Type), Worker = JobHelpers.WorkerOf(j.Type), Name = j.OriginalName,
                Source = Source(j.ClientId), j.BatchId,
                Attempt = j.Attempts, Seconds = Math.Round(Seconds(j.UpdatedAt, now), 1),
                LeaseSecondsLeft = j.LeaseUntil is null ? (double?)null : Math.Round((j.LeaseUntil.Value - now).TotalSeconds, 1),
            }),
            // Hàng chờ theo đúng thứ tự worker sẽ nhận (ưu tiên trước, rồi ai đến trước).
            Waiting = pending.Take(50).Select(j => new
            {
                j.Id, j.Type, Label = JobHelpers.Label(j.Type), Worker = JobHelpers.WorkerOf(j.Type), Name = j.OriginalName,
                Source = Source(j.ClientId), j.BatchId,
                j.Attempts, WaitSeconds = Math.Round(Seconds(j.CreatedAt, now), 1),
            }),
            Recent = finished.Take(100).Select(j => new
            {
                j.Id, j.Type, Label = JobHelpers.Label(j.Type), Worker = JobHelpers.WorkerOf(j.Type), Name = j.OriginalName,
                Source = Source(j.ClientId), j.BatchId, Status = j.Status.ToString(),
                j.Attempts, j.Error, Seconds = Math.Round(Seconds(j.CreatedAt, j.UpdatedAt), 1),
                AgoSeconds = Math.Round(Seconds(j.UpdatedAt, now), 1),
            }),
            Storage = new { Files = files, Bytes = bytes },
        });
    }
}
