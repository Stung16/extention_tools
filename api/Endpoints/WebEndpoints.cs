using System.Text.Json;
using System.Text.RegularExpressions;
using Api.Storage;

namespace Api.Endpoints;

// Cửa cho trang web công cụ của chính mình (người dùng ẩn danh, không cần khoá).
public static class WebEndpoints
{
    public static void MapWebEndpoints(this WebApplication app)
    {
        // Danh sách công cụ, để trang web hiện ra cho người dùng chọn.
        // Online: có máy xử lý đang bật cho loại job này không.
        app.MapGet("/api/job-types", (JobRuntime runtime) =>
            JobCatalog.Types.Select(t => new
            {
                Type = t.Key, t.Value.Label, t.Value.Extensions, t.Value.Options, t.Value.Worker, t.Value.Input,
                t.Value.UrlPattern, Online = runtime.IsOnline(t.Key),
            }));

        var jobs = app.MapGroup("/api/jobs");

        // Tạo job: gửi form gồm "type", "file" (hoặc "url"), và các tuỳ chọn (ví dụ "level") nếu công cụ có.
        jobs.MapPost("/", async (HttpRequest request, AppDb db, IFileStore store, UploadLimits limits) =>
        {
            var form = await request.ReadFormAsync();
            var type = form["type"].ToString();
            if (!JobCatalog.Types.TryGetValue(type, out var jobType))
                return Results.BadRequest(new { error = $"Không hỗ trợ loại job '{type}'." });

            // Trình duyệt đã kiểm tra trước, nhưng API phải kiểm tra lại vì người khác có thể gọi thẳng API.
            var (options, error) = JobHelpers.ValidateOptions(jobType, name => form[name].ToString());
            if (error is not null) return Results.BadRequest(new { error });

            var now = DateTime.UtcNow;
            var job = new Job
            {
                Id = Guid.NewGuid(),
                Type = type,
                Status = JobStatus.Pending,
                Priority = JobHelpers.WebPriority,
                CreatedAt = now,
                UpdatedAt = now,
            };

            if (jobType.Input == "none")
            {
                // Công cụ chỉ cần chữ người dùng nhập (đọc văn bản, tạo nhạc): không có file đầu vào.
                job.OriginalName = "ket-qua";
            }
            else if (jobType.Input == "url")
            {
                // Công cụ dạng đường link (ví dụ YouTube): không có file, lưu link vào tuỳ chọn "url".
                var url = form["url"].ToString().Trim();
                if (url == "") return Results.BadRequest(new { error = "Vui lòng dán đường link." });
                if (url.Length > 500 || (jobType.UrlPattern is not null && !Regex.IsMatch(url, jobType.UrlPattern)))
                    return Results.BadRequest(new { error = "Đường link không hợp lệ cho công cụ này." });
                options!["url"] = url;
                job.OriginalName = "ket-qua";
            }
            else
            {
                var file = form.Files["file"];
                if (file is null || file.Length == 0)
                    return Results.BadRequest(new { error = "Thiếu file." });
                if (file.Length > limits.WebBytes)
                    return Results.BadRequest(new { error = $"File quá lớn: tối đa {limits.WebBytes / 1024 / 1024} MB." });

                var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
                if (!jobType.Extensions.Contains(ext))
                    return Results.BadRequest(new { error = $"Công cụ này chỉ nhận file: {string.Join(", ", jobType.Extensions)}." });

                job.OriginalName = Path.GetFileName(file.FileName);
                // Khoá file do mình đặt (theo Id), không dùng tên người dùng gửi lên.
                job.InputFile = $"web/{job.Id}-input{ext}";
                await using var stream = store.OpenWrite(job.InputFile);
                await file.CopyToAsync(stream);
            }

            job.Options = JsonSerializer.Serialize(options);
            db.Jobs.Add(job);
            await db.SaveChangesAsync();

            return Results.Created($"/api/jobs/{job.Id}", new { job.Id, Status = job.Status.ToString() });
        });

        // Xem trạng thái job.
        jobs.MapGet("/{id:guid}", async (Guid id, AppDb db, IFileStore store, JobRuntime runtime) =>
        {
            var job = await db.Jobs.FindAsync(id);
            return job is null
                ? Results.NotFound()
                : Results.Ok(new
                {
                    job.Id, job.Type, Status = job.Status.ToString(), Options = JobHelpers.ReadOptions(job, hideSecrets: true), job.Error,
                    // Dung lượng file vào/ra (byte), để trang web hiện kiểu "5,8 MB còn 340 KB".
                    InputSize = job.InputFile == "" ? 0 : store.Size(job.InputFile),
                    OutputSize = job.OutputFile is null ? (long?)null : store.Size(job.OutputFile),
                    // Đuôi file kết quả (.mp3, .pdf...): trang web dùng để hiện trình nghe thử với file âm thanh.
                    OutputExt = job.OutputFile is null ? null : Path.GetExtension(job.OutputFile),
                    // Máy xử lý loại job này có đang bật không (để trang báo khi phải chờ lâu).
                    WorkerOnline = runtime.IsOnline(job.Type),
                    job.CreatedAt, job.UpdatedAt,
                });
        });

        // Tải file kết quả (khi job đã Done).
        jobs.MapGet("/{id:guid}/output", async (Guid id, AppDb db, IFileStore store) =>
        {
            var job = await db.Jobs.FindAsync(id);
            if (job is null) return Results.NotFound();
            if (job.Status != JobStatus.Done || job.OutputFile is null)
                return Results.Conflict(new { error = $"Job chưa xong (trạng thái: {job.Status})." });
            if (!store.Exists(job.OutputFile))
                return Results.NotFound(new { error = "File kết quả không còn trên máy chủ." });

            var name = JobHelpers.DownloadName(job);
            // Ghi đúng loại file (audio/mpeg, application/pdf...) để trình duyệt nghe/xem thử được ngay trên trang.
            return Results.Stream(store.OpenRead(job.OutputFile), JobHelpers.ContentType(name), name, enableRangeProcessing: true);
        });
    }
}
