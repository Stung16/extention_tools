using Api;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// ---------- Cấu hình ----------

// Database (SQLite, một file) và file tải lên đều nằm trong thư mục api/data.
// Thư mục này đã nằm trong .gitignore nên không bị đưa lên Git.
var dataDir = Path.Combine(builder.Environment.ContentRootPath, "data");
var filesDir = Path.Combine(dataDir, "files");
Directory.CreateDirectory(filesDir);

builder.Services.AddDbContext<AppDb>(o =>
    o.UseSqlite($"Data Source={Path.Combine(dataDir, "jobs.db")}"));

var app = builder.Build();

// Tạo database và bảng Jobs nếu chưa có.
using (var scope = app.Services.CreateScope())
{
    scope.ServiceProvider.GetRequiredService<AppDb>().Database.EnsureCreated();
}

// Mã bí mật để worker chứng minh "tôi là worker của bạn".
// Lúc phát triển lấy từ appsettings.Development.json; chạy thật thì đặt biến môi trường WorkerKey.
var workerKey = app.Configuration["WorkerKey"]
    ?? throw new InvalidOperationException("Chưa cấu hình WorkerKey.");

// Các loại job đang hỗ trợ: tên hiển thị và đuôi file được phép.
// Thêm handler mới ở worker thì thêm một dòng ở đây, trang web sẽ tự hiện công cụ đó.
var jobTypes = new Dictionary<string, JobTypeInfo>
{
    ["word-to-pdf"] = new("Word sang PDF", [".doc", ".docx", ".odt", ".rtf"]),
};

string FilePath(string name) => Path.Combine(filesDir, name);

// ---------- Trang web ----------

// Phục vụ các file trong thư mục wwwroot (index.html...).
// Mở http://localhost:5100 là thấy trang upload.
app.UseDefaultFiles();
app.UseStaticFiles();

// ---------- Endpoint cho người dùng (website gọi) ----------

// Danh sách công cụ, để trang web hiện ra cho người dùng chọn.
app.MapGet("/api/job-types", () =>
    jobTypes.Select(t => new { Type = t.Key, t.Value.Label, t.Value.Extensions }));

var jobs = app.MapGroup("/api/jobs");

// Tạo job: gửi form gồm "type" và "file".
jobs.MapPost("/", async (HttpRequest request, AppDb db) =>
{
    var form = await request.ReadFormAsync();
    var type = form["type"].ToString();
    var file = form.Files["file"];

    if (!jobTypes.TryGetValue(type, out var jobType))
        return Results.BadRequest(new { error = $"Không hỗ trợ loại job '{type}'." });
    var allowedExts = jobType.Extensions;
    if (file is null || file.Length == 0)
        return Results.BadRequest(new { error = "Thiếu file." });

    var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
    if (!allowedExts.Contains(ext))
        return Results.BadRequest(new { error = $"Loại job '{type}' chỉ nhận file: {string.Join(", ", allowedExts)}." });

    var job = new Job
    {
        Id = Guid.NewGuid(),
        Type = type,
        Status = JobStatus.Pending,
        OriginalName = Path.GetFileName(file.FileName),
        CreatedAt = DateTime.UtcNow,
        UpdatedAt = DateTime.UtcNow,
    };
    // Tên file lưu trên ổ đĩa do mình đặt (theo Id), không dùng tên người dùng gửi lên.
    job.InputFile = $"{job.Id}-input{ext}";

    await using (var stream = File.Create(FilePath(job.InputFile)))
    {
        await file.CopyToAsync(stream);
    }

    db.Jobs.Add(job);
    await db.SaveChangesAsync();

    return Results.Created($"/api/jobs/{job.Id}", new { job.Id, Status = job.Status.ToString() });
});

// Xem trạng thái job.
jobs.MapGet("/{id:guid}", async (Guid id, AppDb db) =>
{
    var job = await db.Jobs.FindAsync(id);
    return job is null
        ? Results.NotFound()
        : Results.Ok(new { job.Id, job.Type, Status = job.Status.ToString(), job.Error, job.CreatedAt, job.UpdatedAt });
});

// Tải file kết quả (khi job đã Done).
jobs.MapGet("/{id:guid}/output", async (Guid id, AppDb db) =>
{
    var job = await db.Jobs.FindAsync(id);
    if (job is null) return Results.NotFound();
    if (job.Status != JobStatus.Done || job.OutputFile is null)
        return Results.Conflict(new { error = $"Job chưa xong (trạng thái: {job.Status})." });

    var downloadName = Path.GetFileNameWithoutExtension(job.OriginalName) + Path.GetExtension(job.OutputFile);
    return Results.File(FilePath(job.OutputFile), "application/octet-stream", downloadName);
});

// ---------- Endpoint cho worker (phải gửi kèm header X-Worker-Key) ----------

var worker = app.MapGroup("/api/jobs").AddEndpointFilter(async (ctx, next) =>
{
    if (ctx.HttpContext.Request.Headers["X-Worker-Key"] != workerKey)
        return Results.Unauthorized();
    return await next(ctx);
});

// Worker hỏi: "có job nào không?"
// 204 = không có. 200 = có, và job được đổi sang Processing ngay.
worker.MapGet("/next", async (AppDb db) =>
{
    var job = await db.Jobs
        .Where(j => j.Status == JobStatus.Pending)
        .OrderBy(j => j.CreatedAt)
        .FirstOrDefaultAsync();
    if (job is null) return Results.NoContent();

    // Chỉ đổi khi job VẪN đang Pending. Nếu có 2 worker cùng hỏi một lúc,
    // chỉ một bên đổi được (changed = 1), bên kia nhận changed = 0.
    var changed = await db.Jobs
        .Where(j => j.Id == job.Id && j.Status == JobStatus.Pending)
        .ExecuteUpdateAsync(s => s
            .SetProperty(j => j.Status, JobStatus.Processing)
            .SetProperty(j => j.UpdatedAt, DateTime.UtcNow));
    if (changed == 0) return Results.NoContent();

    return Results.Ok(new { job.Id, job.Type, job.OriginalName });
});

// Worker tải file đầu vào.
worker.MapGet("/{id:guid}/input", async (Guid id, AppDb db) =>
{
    var job = await db.Jobs.FindAsync(id);
    return job is null
        ? Results.NotFound()
        : Results.File(FilePath(job.InputFile), "application/octet-stream", job.OriginalName);
});

// Worker báo xong, gửi kèm file kết quả (form, trường "file").
worker.MapPost("/{id:guid}/complete", async (Guid id, HttpRequest request, AppDb db) =>
{
    var job = await db.Jobs.FindAsync(id);
    if (job is null) return Results.NotFound();
    if (job.Status != JobStatus.Processing)
        return Results.Conflict(new { error = $"Job không ở trạng thái Processing (đang là {job.Status})." });

    var form = await request.ReadFormAsync();
    var file = form.Files["file"];
    if (file is null || file.Length == 0) return Results.BadRequest(new { error = "Thiếu file kết quả." });

    job.OutputFile = $"{job.Id}-output{Path.GetExtension(file.FileName).ToLowerInvariant()}";
    await using (var stream = File.Create(FilePath(job.OutputFile)))
    {
        await file.CopyToAsync(stream);
    }

    job.Status = JobStatus.Done;
    job.UpdatedAt = DateTime.UtcNow;
    await db.SaveChangesAsync();
    return Results.Ok();
});

// Worker báo lỗi.
worker.MapPost("/{id:guid}/fail", async (Guid id, FailRequest body, AppDb db) =>
{
    var job = await db.Jobs.FindAsync(id);
    if (job is null) return Results.NotFound();

    job.Status = JobStatus.Failed;
    job.Error = body.Error;
    job.UpdatedAt = DateTime.UtcNow;
    await db.SaveChangesAsync();
    return Results.Ok();
});

app.Run();

record FailRequest(string Error);
record JobTypeInfo(string Label, string[] Extensions);
