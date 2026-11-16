using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.RegularExpressions;
using Api;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// ---------- Cấu hình ----------

// Database (SQLite, một file) và file tải lên đều nằm trong thư mục data.
// Thư mục này đã nằm trong .gitignore nên không bị đưa lên Git.
// Chạy trong Docker thì đặt biến môi trường DataDir (ví dụ /data) để dữ liệu nằm ngoài container.
var dataDir = builder.Configuration["DataDir"] ?? Path.Combine(builder.Environment.ContentRootPath, "data");
var filesDir = Path.Combine(dataDir, "files");
Directory.CreateDirectory(filesDir);

builder.Services.AddDbContext<AppDb>(o =>
    o.UseSqlite($"Data Source={Path.Combine(dataDir, "jobs.db")}"));

// Cho phép tải lên file tối đa 100 MB (mặc định của ASP.NET chỉ khoảng 30 MB).
const long MaxUploadBytes = 100L * 1024 * 1024;
builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = MaxUploadBytes + 1024 * 1024);
builder.Services.Configure<Microsoft.AspNetCore.Http.Features.FormOptions>(o =>
    o.MultipartBodyLengthLimit = MaxUploadBytes + 1024 * 1024);

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

// Danh mục loại job: xem JobCatalog.cs.
var jobTypes = JobCatalog.Types;

// Lần cuối mỗi loại job có worker hỏi tới. Worker hỏi mỗi 3 giây, nên quá 30 giây không thấy hỏi
// thì coi như máy xử lý loại job đó đang tắt. Chỉ lưu trong bộ nhớ: API khởi động lại thì quên.
var lastSeen = new ConcurrentDictionary<string, DateTime>();
bool IsOnline(string type) => lastSeen.TryGetValue(type, out var t) && DateTime.UtcNow - t < TimeSpan.FromSeconds(30);

// Giữ job: worker đang xử lý gửi "tín hiệu sống" mỗi 30 giây, mỗi lần gia hạn thêm 2 phút.
// Quá hạn mà không gia hạn (mất điện, tắt worker, chương trình sập) thì job được trả về hàng chờ.
// Một job làm sập worker quá 3 lần (ví dụ file quá nặng làm tràn bộ nhớ GPU) thì báo lỗi luôn, không thử nữa.
// (Đổi được qua cấu hình JobLeaseSeconds, ví dụ để chạy thử nhanh; worker đổi HEARTBEAT_SECONDS cho khớp.)
var leaseTime = TimeSpan.FromSeconds(app.Configuration.GetValue("JobLeaseSeconds", 120));
const int MaxAttempts = 3;

var contentTypes = new Microsoft.AspNetCore.StaticFiles.FileExtensionContentTypeProvider();

string FilePath(string name) => Path.Combine(filesDir, name);
long FileSize(string name) => name != "" && File.Exists(FilePath(name)) ? new FileInfo(FilePath(name)).Length : 0;

// Đổi cột Options (chuỗi JSON) thành danh sách tên -> giá trị.
// hideSecrets = true: bỏ các tuỳ chọn bí mật (mật khẩu) trước khi trả ra ngoài cho trình duyệt.
Dictionary<string, string> ReadOptions(Job job, bool hideSecrets = false)
{
    var options = JsonSerializer.Deserialize<Dictionary<string, string>>(job.Options) ?? [];
    if (hideSecrets)
        foreach (var name in SecretNames(job)) options.Remove(name);
    return options;
}

// Tên các tuỳ chọn bí mật của loại job này (Kind = "password").
IEnumerable<string> SecretNames(Job job) =>
    jobTypes.TryGetValue(job.Type, out var t) ? t.Options.Where(o => o.Kind == "password").Select(o => o.Name) : [];

// Job xong hoặc lỗi thì không cần mật khẩu nữa: xoá khỏi database, không để nằm lại.
void ForgetSecrets(Job job) => job.Options = JsonSerializer.Serialize(ReadOptions(job, hideSecrets: true));

// Tìm job "đang xử lý" đã quá hạn giữ (worker không còn gửi tín hiệu sống) và xử lý lại.
// Gọi mỗi khi có worker hỏi việc: job bị bỏ rơi chỉ có ý nghĩa khi có worker sẵn sàng làm lại.
async Task RecoverAbandonedJobs(AppDb db)
{
    var now = DateTime.UtcNow;

    // Còn lượt: trả về hàng chờ. Điều kiện nằm ngay trong câu lệnh UPDATE, nên nếu worker vừa kịp
    // gia hạn thì job không bị trả về nhầm.
    await db.Jobs
        .Where(j => j.Status == JobStatus.Processing && j.LeaseUntil < now && j.Attempts < MaxAttempts)
        .ExecuteUpdateAsync(s => s
            .SetProperty(j => j.Status, JobStatus.Pending)
            .SetProperty(j => j.LeaseUntil, (DateTime?)null)
            .SetProperty(j => j.UpdatedAt, now));

    // Hết lượt: báo lỗi cho người dùng (nạp từng job để xoá được mật khẩu trong tuỳ chọn).
    var dead = await db.Jobs
        .Where(j => j.Status == JobStatus.Processing && j.LeaseUntil < now)
        .ToListAsync();
    foreach (var job in dead)
    {
        job.Status = JobStatus.Failed;
        job.Error = $"Máy xử lý bị dừng giữa chừng {job.Attempts} lần với file này. " +
                    "File có thể quá nặng; hãy thử file nhỏ hơn hoặc thử lại sau.";
        job.LeaseUntil = null;
        job.UpdatedAt = now;
        ForgetSecrets(job);
    }
    if (dead.Count > 0) await db.SaveChangesAsync();
}

// ---------- Trang web ----------

// Phục vụ các file trong thư mục wwwroot (trang web React đã build).
app.UseDefaultFiles();
app.UseStaticFiles();

// ---------- Endpoint cho người dùng (website gọi) ----------

// Danh sách công cụ, để trang web hiện ra cho người dùng chọn.
// Online: có máy xử lý đang bật cho loại job này không.
app.MapGet("/api/job-types", () =>
    jobTypes.Select(t => new
    {
        Type = t.Key, t.Value.Label, t.Value.Extensions, t.Value.Options, t.Value.Worker, t.Value.Input,
        t.Value.UrlPattern, Online = IsOnline(t.Key),
    }));

var jobs = app.MapGroup("/api/jobs");

// Tạo job: gửi form gồm "type", "file" (hoặc "url"), và các tuỳ chọn (ví dụ "level") nếu công cụ có.
jobs.MapPost("/", async (HttpRequest request, AppDb db) =>
{
    var form = await request.ReadFormAsync();
    var type = form["type"].ToString();
    if (!jobTypes.TryGetValue(type, out var jobType))
        return Results.BadRequest(new { error = $"Không hỗ trợ loại job '{type}'." });

    // Đọc từng tuỳ chọn và kiểm tra. Trình duyệt đã kiểm tra trước, nhưng API phải kiểm tra lại
    // vì người khác có thể gọi thẳng API mà không qua trang web.
    var options = new Dictionary<string, string>();
    foreach (var opt in jobType.Options)
    {
        var value = form[opt.Name].ToString();
        if (opt.Kind is "text" or "textarea") value = value.Trim(); // mật khẩu thì giữ nguyên, kể cả dấu cách
        if (value == "")
        {
            if (opt.Required) return Results.BadRequest(new { error = $"Vui lòng nhập: {opt.Label}." });
            value = opt.Default;
        }

        if (opt.Choices is { Length: > 0 } choices)
        {
            if (!choices.Any(c => c.Value == value))
                return Results.BadRequest(new { error = $"Giá trị '{value}' không hợp lệ cho tuỳ chọn '{opt.Label}'." });
        }
        else
        {
            if (value.Length > opt.MaxLength)
                return Results.BadRequest(new { error = $"{opt.Label}: tối đa {opt.MaxLength} ký tự." });
            if (opt.Pattern is not null && !Regex.IsMatch(value, opt.Pattern))
                return Results.BadRequest(new { error = $"{opt.Label} không đúng dạng. {opt.Hint}".Trim() });
        }
        options[opt.Name] = value;
    }

    var job = new Job
    {
        Id = Guid.NewGuid(),
        Type = type,
        Status = JobStatus.Pending,
        CreatedAt = DateTime.UtcNow,
        UpdatedAt = DateTime.UtcNow,
    };

    if (jobType.Input == "none")
    {
        // Công cụ chỉ cần chữ người dùng nhập (đọc văn bản, tạo nhạc): không có file đầu vào.
        job.OriginalName = "ket-qua";
        job.InputFile = "";
    }
    else if (jobType.Input == "url")
    {
        // Công cụ dạng đường link (ví dụ YouTube): không có file, lưu link vào tuỳ chọn "url".
        var url = form["url"].ToString().Trim();
        if (url == "") return Results.BadRequest(new { error = "Vui lòng dán đường link." });
        if (url.Length > 500 || (jobType.UrlPattern is not null && !Regex.IsMatch(url, jobType.UrlPattern)))
            return Results.BadRequest(new { error = "Đường link không hợp lệ cho công cụ này." });
        options["url"] = url;
        job.OriginalName = "ket-qua";
        job.InputFile = "";
    }
    else
    {
        var file = form.Files["file"];
        if (file is null || file.Length == 0)
            return Results.BadRequest(new { error = "Thiếu file." });
        if (file.Length > MaxUploadBytes)
            return Results.BadRequest(new { error = "File quá lớn: tối đa 100 MB." });

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!jobType.Extensions.Contains(ext))
            return Results.BadRequest(new { error = $"Công cụ này chỉ nhận file: {string.Join(", ", jobType.Extensions)}." });

        job.OriginalName = Path.GetFileName(file.FileName);
        // Tên file lưu trên ổ đĩa do mình đặt (theo Id), không dùng tên người dùng gửi lên.
        job.InputFile = $"{job.Id}-input{ext}";
        await using var stream = File.Create(FilePath(job.InputFile));
        await file.CopyToAsync(stream);
    }

    job.Options = JsonSerializer.Serialize(options);
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
        : Results.Ok(new
        {
            job.Id, job.Type, Status = job.Status.ToString(), Options = ReadOptions(job, hideSecrets: true), job.Error,
            // Dung lượng file vào/ra (byte), để trang web hiện kiểu "5,8 MB còn 340 KB".
            InputSize = FileSize(job.InputFile),
            OutputSize = job.OutputFile is null ? (long?)null : FileSize(job.OutputFile),
            // Đuôi file kết quả (.mp3, .pdf...): trang web dùng để hiện trình nghe thử với file âm thanh.
            OutputExt = job.OutputFile is null ? null : Path.GetExtension(job.OutputFile),
            // Máy xử lý loại job này có đang bật không (để trang báo khi phải chờ lâu).
            WorkerOnline = IsOnline(job.Type),
            // Lượt xử lý hiện tại (lớn hơn 1 nghĩa là lần trước máy xử lý bị dừng giữa chừng, đang làm lại).
            job.Attempts,
            job.CreatedAt, job.UpdatedAt,
        });
});

// Tải file kết quả (khi job đã Done).
jobs.MapGet("/{id:guid}/output", async (Guid id, AppDb db) =>
{
    var job = await db.Jobs.FindAsync(id);
    if (job is null) return Results.NotFound();
    if (job.Status != JobStatus.Done || job.OutputFile is null)
        return Results.Conflict(new { error = $"Job chưa xong (trạng thái: {job.Status})." });

    // Tên khi tải về: tên file gốc + đuôi của kết quả. Kết quả cùng đuôi với file gốc (nén, tóm tắt...)
    // thì thêm "-ket-qua" để người dùng không nhầm với file gốc.
    var outExt = Path.GetExtension(job.OutputFile);
    var stem = Path.GetFileNameWithoutExtension(job.OriginalName);
    var sameExt = string.Equals(Path.GetExtension(job.OriginalName), outExt, StringComparison.OrdinalIgnoreCase);
    var downloadName = stem + (sameExt && job.InputFile != "" ? "-ket-qua" : "") + outExt;
    // Ghi đúng loại file (audio/mpeg, application/pdf...) để trình duyệt nghe/xem thử được ngay trên trang.
    if (!contentTypes.TryGetContentType(downloadName, out var contentType)) contentType = "application/octet-stream";
    return Results.File(FilePath(job.OutputFile), contentType, downloadName);
});

// ---------- Endpoint cho worker (phải gửi kèm header X-Worker-Key) ----------

async ValueTask<object?> RequireWorkerKey(EndpointFilterInvocationContext ctx, EndpointFilterDelegate next) =>
    ctx.HttpContext.Request.Headers["X-Worker-Key"] != workerKey ? Results.Unauthorized() : await next(ctx);

var worker = app.MapGroup("/api/jobs").AddEndpointFilter(RequireWorkerKey);

// Worker hỏi: "có job nào không?", kèm danh sách loại job nó làm được (?types=a,b,c).
// 204 = không có. 200 = có, và job được đổi sang Processing ngay.
// Nhờ "types", worker AI chỉ nhận job AI, worker thường không nhận nhầm job AI.
worker.MapGet("/next", async (string? types, AppDb db) =>
{
    var wanted = (types ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    foreach (var t in wanted) lastSeen[t] = DateTime.UtcNow;

    await RecoverAbandonedJobs(db);

    var query = db.Jobs.Where(j => j.Status == JobStatus.Pending);
    if (wanted.Length > 0) query = query.Where(j => wanted.Contains(j.Type));
    var job = await query.OrderBy(j => j.CreatedAt).FirstOrDefaultAsync();
    if (job is null) return Results.NoContent();

    // Chỉ đổi khi job VẪN đang Pending (và chưa ai nhận lượt này). Nếu có 2 worker cùng hỏi một lúc,
    // chỉ một bên đổi được (changed = 1), bên kia nhận changed = 0.
    var attempt = job.Attempts + 1;
    var now = DateTime.UtcNow;
    var leaseUntil = now.Add(leaseTime);
    var changed = await db.Jobs
        .Where(j => j.Id == job.Id && j.Status == JobStatus.Pending && j.Attempts == job.Attempts)
        .ExecuteUpdateAsync(s => s
            .SetProperty(j => j.Status, JobStatus.Processing)
            .SetProperty(j => j.Attempts, attempt)
            .SetProperty(j => j.LeaseUntil, leaseUntil)
            .SetProperty(j => j.UpdatedAt, now));
    if (changed == 0) return Results.NoContent();

    var input = jobTypes.TryGetValue(job.Type, out var info) ? info.Input : "file";
    return Results.Ok(new { job.Id, job.Type, job.OriginalName, Input = input, Attempt = attempt, Options = ReadOptions(job) });
});

// Worker báo "tôi vẫn đang làm job này" (?attempt=số lượt), để gia hạn giữ job.
// 409 = job không còn thuộc lượt này nữa (đã bị trả về hàng chờ, hoặc đã xong/lỗi): worker nên bỏ.
worker.MapPost("/{id:guid}/heartbeat", async (Guid id, int attempt, AppDb db) =>
{
    var leaseUntil = DateTime.UtcNow.Add(leaseTime);
    var changed = await db.Jobs
        .Where(j => j.Id == id && j.Status == JobStatus.Processing && j.Attempts == attempt)
        .ExecuteUpdateAsync(s => s.SetProperty(j => j.LeaseUntil, leaseUntil));
    return changed == 1
        ? Results.Ok()
        : Results.Conflict(new { error = "Job không còn thuộc lượt xử lý này." });
});

// Worker tải file đầu vào.
worker.MapGet("/{id:guid}/input", async (Guid id, AppDb db) =>
{
    var job = await db.Jobs.FindAsync(id);
    return job is null || job.InputFile == ""
        ? Results.NotFound()
        : Results.File(FilePath(job.InputFile), "application/octet-stream", job.OriginalName);
});

// Worker báo xong, gửi kèm file kết quả (form: trường "file", và "attempt" là số lượt worker nhận được).
worker.MapPost("/{id:guid}/complete", async (Guid id, HttpRequest request, AppDb db) =>
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

    job.OutputFile = $"{job.Id}-output{Path.GetExtension(file.FileName).ToLowerInvariant()}";
    await using (var stream = File.Create(FilePath(job.OutputFile)))
    {
        await file.CopyToAsync(stream);
    }

    // Job dạng đường link không có tên file gốc: lấy tên worker đặt cho kết quả (ví dụ tên video YouTube).
    if (job.InputFile == "" && form["name"].ToString() is { Length: > 0 } name)
        job.OriginalName = Path.GetFileName(name)[..Math.Min(Path.GetFileName(name).Length, 120)];

    job.Status = JobStatus.Done;
    job.LeaseUntil = null;
    job.UpdatedAt = DateTime.UtcNow;
    ForgetSecrets(job);
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
    ForgetSecrets(job);
    await db.SaveChangesAsync();
    return Results.Ok();
});

// ---------- Endpoint cho trình giám sát (monitor/, app Rust) ----------
// Dùng chung mã X-Worker-Key: chỉ người quản lý máy chủ mới có mã này.

app.MapGet("/api/admin/overview", async (AppDb db) =>
{
    var now = DateTime.UtcNow;
    var since = now.AddHours(-24);
    string Label(string type) => jobTypes.TryGetValue(type, out var t) ? t.Label : type;
    string WorkerOf(string type) => jobTypes.TryGetValue(type, out var t) ? t.Worker : "?";
    double Seconds(DateTime from, DateTime to) => Math.Max(0, (to - from).TotalSeconds);

    var totals = await db.Jobs.GroupBy(j => j.Status)
        .Select(g => new { Status = g.Key, Count = g.Count() })
        .ToDictionaryAsync(x => x.Status, x => x.Count);
    int Total(JobStatus s) => totals.GetValueOrDefault(s);

    // Job đang chờ / đang xử lý, và job kết thúc trong 24 giờ qua (số lượng nhỏ, tính tiếp trong bộ nhớ).
    var active = await db.Jobs
        .Where(j => j.Status == JobStatus.Pending || j.Status == JobStatus.Processing)
        .OrderBy(j => j.CreatedAt)
        .Select(j => new { j.Id, j.Type, j.Status, j.OriginalName, j.Attempts, j.CreatedAt, j.UpdatedAt, j.LeaseUntil })
        .ToListAsync();
    var finished = await db.Jobs
        .Where(j => (j.Status == JobStatus.Done || j.Status == JobStatus.Failed) && j.UpdatedAt >= since)
        .OrderByDescending(j => j.UpdatedAt)
        .Select(j => new { j.Id, j.Type, j.Status, j.OriginalName, j.Attempts, j.Error, j.CreatedAt, j.UpdatedAt })
        .ToListAsync();

    var pending = active.Where(j => j.Status == JobStatus.Pending).ToList();
    var processing = active.Where(j => j.Status == JobStatus.Processing).ToList();
    var done24 = finished.Where(j => j.Status == JobStatus.Done).ToList();

    // Thời gian "từ lúc gửi tới lúc xong" (gồm cả thời gian chờ trong hàng): đúng thứ người dùng cảm nhận.
    double? Avg(IEnumerable<double> xs) { var l = xs.ToList(); return l.Count == 0 ? null : Math.Round(l.Average(), 1); }

    // Mỗi nhóm worker ("main", "ai"): bật nếu có loại job nào của nhóm vừa được hỏi tới.
    var workers = jobTypes.GroupBy(t => t.Value.Worker).Select(g =>
    {
        var seen = g.Select(t => lastSeen.TryGetValue(t.Key, out var v) ? v : (DateTime?)null).Max();
        return new
        {
            Name = g.Key,
            Online = g.Any(t => IsOnline(t.Key)),
            LastSeenSecondsAgo = seen is null ? (double?)null : Math.Round(Seconds(seen.Value, now), 1),
            Types = g.Count(),
            Pending = pending.Count(j => WorkerOf(j.Type) == g.Key),
            Processing = processing.Count(j => WorkerOf(j.Type) == g.Key),
        };
    });

    var types = jobTypes.Select(t => new
    {
        Type = t.Key,
        t.Value.Label,
        t.Value.Worker,
        Online = IsOnline(t.Key),
        Pending = pending.Count(j => j.Type == t.Key),
        Processing = processing.Count(j => j.Type == t.Key),
        Done24h = done24.Count(j => j.Type == t.Key),
        Failed24h = finished.Count(j => j.Type == t.Key && j.Status == JobStatus.Failed),
        AvgSeconds24h = Avg(done24.Where(j => j.Type == t.Key).Select(j => Seconds(j.CreatedAt, j.UpdatedAt))),
    });

    var files = Directory.EnumerateFiles(filesDir).Select(f => new FileInfo(f).Length).ToList();

    return Results.Ok(new
    {
        ServerTime = now,
        Totals = new
        {
            Pending = Total(JobStatus.Pending), Processing = Total(JobStatus.Processing),
            Done = Total(JobStatus.Done), Failed = Total(JobStatus.Failed),
        },
        Last24h = new
        {
            Done = done24.Count,
            Failed = finished.Count - done24.Count,
            AvgSeconds = Avg(done24.Select(j => Seconds(j.CreatedAt, j.UpdatedAt))),
        },
        OldestPendingSeconds = pending.Count == 0 ? (double?)null : Math.Round(Seconds(pending[0].CreatedAt, now), 1),
        Workers = workers,
        Types = types,
        // Lúc worker nhận job, UpdatedAt được đặt lại (tín hiệu sống không đổi cột này), nên now - UpdatedAt
        // là thời gian đã xử lý ở lượt hiện tại.
        Running = processing.Select(j => new
        {
            j.Id, j.Type, Label = Label(j.Type), Worker = WorkerOf(j.Type), Name = j.OriginalName,
            Attempt = j.Attempts, Seconds = Math.Round(Seconds(j.UpdatedAt, now), 1),
            LeaseSecondsLeft = j.LeaseUntil is null ? (double?)null : Math.Round((j.LeaseUntil.Value - now).TotalSeconds, 1),
        }),
        Waiting = pending.Take(50).Select(j => new
        {
            j.Id, j.Type, Label = Label(j.Type), Worker = WorkerOf(j.Type), Name = j.OriginalName,
            j.Attempts, WaitSeconds = Math.Round(Seconds(j.CreatedAt, now), 1),
        }),
        Recent = finished.Take(100).Select(j => new
        {
            j.Id, j.Type, Label = Label(j.Type), Worker = WorkerOf(j.Type), Name = j.OriginalName, Status = j.Status.ToString(),
            j.Attempts, j.Error, Seconds = Math.Round(Seconds(j.CreatedAt, j.UpdatedAt), 1),
            AgoSeconds = Math.Round(Seconds(j.UpdatedAt, now), 1),
        }),
        Storage = new { Files = files.Count, Bytes = files.Sum() },
    });
}).AddEndpointFilter(RequireWorkerKey);

// Thử lại job lỗi: đưa về hàng chờ, đếm lượt lại từ đầu. File đầu vào vẫn còn trên ổ nên làm lại được.
// (Mật khẩu của công cụ đặt/gỡ mật khẩu đã bị xoá khi job lỗi, nên job loại đó thử lại sẽ thiếu mật khẩu.)
app.MapPost("/api/admin/jobs/{id:guid}/retry", async (Guid id, AppDb db) =>
{
    var job = await db.Jobs.FindAsync(id);
    if (job is null) return Results.NotFound();
    if (job.Status != JobStatus.Failed)
        return Results.Conflict(new { error = "Chỉ thử lại được job đang lỗi." });
    if (job.InputFile != "" && !File.Exists(FilePath(job.InputFile)))
        return Results.Conflict(new { error = "File gốc của job này không còn trên máy chủ." });

    job.Status = JobStatus.Pending;
    job.Error = null;
    job.Attempts = 0;
    job.LeaseUntil = null;
    job.CreatedAt = DateTime.UtcNow; // xếp lại vào cuối hàng, tính thời gian chờ từ bây giờ
    job.UpdatedAt = DateTime.UtcNow;
    await db.SaveChangesAsync();
    return Results.Ok();
}).AddEndpointFilter(RequireWorkerKey);

// Huỷ job đang chờ. Job đang chạy thì không huỷ được (worker không có cách dừng giữa chừng).
app.MapPost("/api/admin/jobs/{id:guid}/cancel", async (Guid id, AppDb db) =>
{
    var now = DateTime.UtcNow;
    var changed = await db.Jobs
        .Where(j => j.Id == id && j.Status == JobStatus.Pending)
        .ExecuteUpdateAsync(s => s
            .SetProperty(j => j.Status, JobStatus.Failed)
            .SetProperty(j => j.Error, "Đã bị huỷ bởi người quản lý máy chủ.")
            .SetProperty(j => j.UpdatedAt, now));
    return changed == 1 ? Results.Ok() : Results.Conflict(new { error = "Chỉ huỷ được job đang chờ." });
}).AddEndpointFilter(RequireWorkerKey);

// Các địa chỉ trang như /nen-pdf hay /word-sang-pdf không phải file thật:
// trả về index.html, rồi trang web React tự hiện đúng công cụ.
// Địa chỉ /api/... không khớp endpoint nào thì vẫn báo 404 như bình thường.
app.MapFallback(async context =>
{
    if (context.Request.Path.StartsWithSegments("/api"))
    {
        context.Response.StatusCode = StatusCodes.Status404NotFound;
        return;
    }
    context.Response.ContentType = "text/html; charset=utf-8";
    var index = Path.Combine(app.Environment.WebRootPath ?? "wwwroot", "index.html");
    if (!File.Exists(index))
    {
        // Máy mới clone về chưa build giao diện React.
        await context.Response.WriteAsync("<meta charset=utf-8><p>Chưa build giao diện. Chạy trong thư mục <b>web</b>: " +
                                          "<code>npm install</code> rồi <code>npm run build</code>, sau đó tải lại trang.</p>");
        return;
    }
    await context.Response.SendFileAsync(index);
});

app.Run();

record FailRequest(string Error, int Attempt);
