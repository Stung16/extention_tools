using Api.Storage;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

// Cửa cho worker (máy xử lý). Phải gửi kèm header X-Worker-Key.
public static class WorkerEndpoints
{
    public record FailRequest(string Error, int Attempt);

    public static void MapWorkerEndpoints(this WebApplication app)
    {
        var worker = app.MapGroup("/api/jobs").RequireSecretHeader("X-Worker-Key", s => s.WorkerKey);

        // Worker hỏi: "có job nào không?", kèm danh sách loại job nó làm được (?types=a,b,c).
        // 204 = không có. 200 = có, và job được đổi sang Processing ngay.
        // Nhờ "types", worker AI chỉ nhận job AI, worker thường không nhận nhầm job AI.
        worker.MapGet("/next", async (string? types, AppDb db, JobRuntime runtime) =>
        {
            var wanted = (types ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            foreach (var t in wanted) runtime.Seen(t);

            await runtime.RecoverAbandonedJobs(db);

            // Ưu tiên cao làm trước (job lẻ của trang web trước job trong lô), cùng ưu tiên thì ai đến trước làm trước.
            var query = db.Jobs.Where(j => j.Status == JobStatus.Pending);
            if (wanted.Length > 0) query = query.Where(j => wanted.Contains(j.Type));
            var job = await query.OrderByDescending(j => j.Priority).ThenBy(j => j.CreatedAt).FirstOrDefaultAsync();
            if (job is null) return Results.NoContent();

            // Chỉ đổi khi job VẪN đang Pending (và chưa ai nhận lượt này). Nếu có 2 worker cùng hỏi một lúc,
            // chỉ một bên đổi được (changed = 1), bên kia nhận changed = 0.
            var attempt = job.Attempts + 1;
            var now = DateTime.UtcNow;
            var leaseUntil = now.Add(runtime.LeaseTime);
            var changed = await db.Jobs
                .Where(j => j.Id == job.Id && j.Status == JobStatus.Pending && j.Attempts == job.Attempts)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(j => j.Status, JobStatus.Processing)
                    .SetProperty(j => j.Attempts, attempt)
                    .SetProperty(j => j.LeaseUntil, leaseUntil)
                    .SetProperty(j => j.UpdatedAt, now));
            if (changed == 0) return Results.NoContent();

            var input = JobCatalog.Types.TryGetValue(job.Type, out var info) ? info.Input : "file";
            return Results.Ok(new
            {
                job.Id, job.Type, job.OriginalName, Input = input, Attempt = attempt, Options = JobHelpers.ReadOptions(job),
            });
        });

        // Worker báo "tôi vẫn đang làm job này" (?attempt=số lượt), để gia hạn giữ job.
        // 409 = job không còn thuộc lượt này nữa (đã bị trả về hàng chờ, hoặc đã xong/lỗi): worker nên bỏ.
        worker.MapPost("/{id:guid}/heartbeat", async (Guid id, int attempt, AppDb db, JobRuntime runtime) =>
        {
            var leaseUntil = DateTime.UtcNow.Add(runtime.LeaseTime);
            var changed = await db.Jobs
                .Where(j => j.Id == id && j.Status == JobStatus.Processing && j.Attempts == attempt)
                .ExecuteUpdateAsync(s => s.SetProperty(j => j.LeaseUntil, leaseUntil));
            return changed == 1
                ? Results.Ok()
                : Results.Conflict(new { error = "Job không còn thuộc lượt xử lý này." });
        });

        // Worker tải file đầu vào.
        worker.MapGet("/{id:guid}/input", async (Guid id, AppDb db, IFileStore store) =>
        {
            var job = await db.Jobs.FindAsync(id);
            return job is null || job.InputFile == "" || !store.Exists(job.InputFile)
                ? Results.NotFound()
                : Results.Stream(store.OpenRead(job.InputFile), "application/octet-stream", job.OriginalName, enableRangeProcessing: true);
        });

        // Worker báo xong, gửi kèm file kết quả (form: trường "file", và "attempt" là số lượt worker nhận được).
        worker.MapPost("/{id:guid}/complete", async (Guid id, HttpRequest request, AppDb db, IFileStore store) =>
        {
            var job = await db.Jobs.FindAsync(id);
            if (job is null) return Results.NotFound();

            var form = await request.ReadFormAsync();
            if (!int.TryParse(form["attempt"], out var attempt))
                return Results.BadRequest(new { error = "Thiếu số lượt (attempt)." });
            // Worker của lượt cũ (đã bị coi là chết) gửi muộn thì không nhận, tránh ghi đè lượt mới.
            if (job.Status != JobStatus.Processing || job.Attempts != attempt)
                return Results.Conflict(new { error = $"Job không còn thuộc lượt {attempt} (đang là {job.Status}, lượt {job.Attempts})." });

            var file = form.Files["file"];
            if (file is null || file.Length == 0) return Results.BadRequest(new { error = "Thiếu file kết quả." });

            job.OutputFile = $"results/{job.Id}{FileKeys.SafeExt(file.FileName)}";
            await using (var stream = store.OpenWrite(job.OutputFile))
            {
                await file.CopyToAsync(stream);
            }

            // Job dạng đường link không có tên file gốc: lấy tên worker đặt cho kết quả (ví dụ tên video YouTube).
            if (job.InputFile == "" && form["name"].ToString() is { Length: > 0 } name)
                job.OriginalName = Path.GetFileName(name)[..Math.Min(Path.GetFileName(name).Length, 120)];

            job.Status = JobStatus.Done;
            job.LeaseUntil = null;
            job.UpdatedAt = DateTime.UtcNow;
            JobHelpers.ForgetSecrets(job);
            await db.SaveChangesAsync();
            return Results.Ok();
        });

        // Worker báo lỗi (JSON: {"error": "...", "attempt": số lượt}).
        worker.MapPost("/{id:guid}/fail", async (Guid id, FailRequest body, AppDb db) =>
        {
            var job = await db.Jobs.FindAsync(id);
            if (job is null) return Results.NotFound();
            // Giống /complete: chỉ nhận từ đúng lượt đang xử lý, không ghi đè job đã xong.
            if (job.Status != JobStatus.Processing || job.Attempts != body.Attempt)
                return Results.Conflict(new { error = $"Job không còn thuộc lượt {body.Attempt} (đang là {job.Status}, lượt {job.Attempts})." });

            job.Status = JobStatus.Failed;
            job.Error = body.Error;
            job.LeaseUntil = null;
            job.UpdatedAt = DateTime.UtcNow;
            JobHelpers.ForgetSecrets(job);
            await db.SaveChangesAsync();
            return Results.Ok();
        });
    }
}
