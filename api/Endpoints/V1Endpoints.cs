using System.Text.Json;
using Api.Storage;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

// API v1 cho app khách (ví dụ web nhiếp ảnh gia). Header: Authorization: Bearer <khoá API>.
// Mỗi app chỉ thấy file, lô, job của chính nó.
//
// Luồng: POST /v1/uploads (xin chỗ) -> PUT file lên uploadUrl -> POST /v1/batches (tạo lô)
//        -> GET /v1/batches/{id} (theo dõi) -> GET /v1/jobs/{id}/result (lấy link tải kết quả).
public static class V1Endpoints
{
    public record UploadRequest(string? FileName, long Size);
    public record BatchRequest(string? Type, Dictionary<string, JsonElement>? Options, Guid[]? UploadIds, string? ExternalId);

    const string ClientItem = "v1.client";
    const int MaxBatchFiles = 500;
    static readonly TimeSpan UploadLinkLife = TimeSpan.FromHours(2);
    static readonly TimeSpan ResultLinkLife = TimeSpan.FromHours(6);

    public static void MapV1Endpoints(this WebApplication app)
    {
        // Link tải lên / tải về có chữ ký (chỉ khi kho là ổ đĩa; với kho S3, link trỏ thẳng vào kho).
        // Không cần khoá API: chữ ký trong link đã chứng minh link do API cấp.
        if (app.Services.GetRequiredService<IFileStore>() is LocalFileStore)
        {
            app.MapPut("/v1/files/{**key}", PutFile);
            app.MapGet("/v1/files/{**key}", GetFile);
        }

        var v1 = app.MapGroup("/v1").AddEndpointFilter(RequireClient);

        v1.MapGet("/job-types", () =>
            JobCatalog.Types.Where(t => t.Value.Input == "file").Select(t => new
            {
                Type = t.Key, t.Value.Label, t.Value.Extensions, t.Value.Options,
            }));

        v1.MapPost("/uploads", CreateUpload);
        v1.MapPost("/batches", CreateBatch);

        v1.MapGet("/batches/{id:guid}", async (Guid id, HttpContext http, AppDb db) =>
        {
            var batch = await db.Batches.AsNoTracking().FirstOrDefaultAsync(b => b.Id == id && b.ClientId == Client(http).Id);
            return batch is null ? NotFound("Không tìm thấy lô.") : Results.Ok(await BatchView(db, batch));
        });

        // Huỷ các job còn đang chờ trong lô. Job đang chạy vẫn chạy tiếp tới khi xong.
        v1.MapPost("/batches/{id:guid}/cancel", async (Guid id, HttpContext http, AppDb db) =>
        {
            var batch = await db.Batches.AsNoTracking().FirstOrDefaultAsync(b => b.Id == id && b.ClientId == Client(http).Id);
            if (batch is null) return NotFound("Không tìm thấy lô.");
            var now = DateTime.UtcNow;
            var cancelled = await db.Jobs
                .Where(j => j.BatchId == id && j.Status == JobStatus.Pending)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(j => j.Status, JobStatus.Cancelled)
                    .SetProperty(j => j.Error, "Đã huỷ theo yêu cầu của ứng dụng.")
                    .SetProperty(j => j.UpdatedAt, now));
            return Results.Ok(new { Cancelled = cancelled, Batch = await BatchView(db, batch) });
        });

        v1.MapGet("/jobs/{id:guid}", async (Guid id, HttpContext http, AppDb db) =>
        {
            var job = await db.Jobs.AsNoTracking().FirstOrDefaultAsync(j => j.Id == id && j.ClientId == Client(http).Id);
            return job is null ? NotFound("Không tìm thấy job.") : Results.Ok(JobView(job));
        });

        // Link tải kết quả, có thời hạn. Hết hạn thì gọi lại endpoint này để lấy link mới.
        v1.MapGet("/jobs/{id:guid}/result", async (Guid id, HttpContext http, AppDb db, IFileStore store) =>
        {
            var job = await db.Jobs.AsNoTracking().FirstOrDefaultAsync(j => j.Id == id && j.ClientId == Client(http).Id);
            if (job is null) return NotFound("Không tìm thấy job.");
            if (job.Status != JobStatus.Done || job.OutputFile is null)
                return Results.Conflict(new { error = $"Job chưa có kết quả (trạng thái: {job.Status})." });
            if (!store.Exists(job.OutputFile))
                return Results.Json(new { error = "File kết quả không còn trên máy chủ." }, statusCode: StatusCodes.Status410Gone);

            var fileName = JobHelpers.DownloadName(job);
            var expires = DateTime.UtcNow.Add(ResultLinkLife);
            return Results.Ok(new
            {
                Url = store.DownloadUrl(BaseUrl(http.Request), job.OutputFile, fileName, expires),
                FileName = fileName,
                Size = store.Size(job.OutputFile),
                ExpiresAt = expires,
            });
        });
    }

    // ---------- Xác thực app khách ----------

    static async ValueTask<object?> RequireClient(EndpointFilterInvocationContext ctx, EndpointFilterDelegate next)
    {
        var http = ctx.HttpContext;
        var header = http.Request.Headers.Authorization.ToString();
        if (!header.StartsWith("Bearer ", StringComparison.Ordinal))
            return Unauthorized("Thiếu khoá API (header Authorization: Bearer <khoá>).");

        var hash = ApiKeys.Hash(header["Bearer ".Length..].Trim());
        var db = http.RequestServices.GetRequiredService<AppDb>();
        var client = await db.ApiClients.AsNoTracking().FirstOrDefaultAsync(c => c.KeyHash == hash);
        if (client is null || client.Disabled)
            return Unauthorized("Khoá API không hợp lệ hoặc đã bị khoá.");

        http.Items[ClientItem] = client;
        return await next(ctx);
    }

    static ApiClient Client(HttpContext http) => (ApiClient)http.Items[ClientItem]!;

    // ---------- Tải file lên ----------

    static async Task<IResult> CreateUpload(UploadRequest body, HttpContext http, AppDb db, IFileStore store, UploadLimits limits)
    {
        var name = Path.GetFileName(body.FileName ?? "").Trim();
        if (name == "" || name.Length > 200) return BadRequest("Tên file (fileName) phải có từ 1 tới 200 ký tự.");
        var ext = Path.GetExtension(name).ToLowerInvariant();
        if (!FileKeys.IsValidExt(ext)) return BadRequest("Tên file phải có đuôi hợp lệ, ví dụ .arw, .jpg.");
        if (body.Size <= 0) return BadRequest("Thiếu dung lượng file (size, tính bằng byte).");
        if (body.Size > limits.ApiBytes) return BadRequest($"File quá lớn: tối đa {limits.ApiBytes / 1024 / 1024} MB.");

        var upload = new Upload
        {
            Id = Guid.NewGuid(), ClientId = Client(http).Id, FileName = name, Ext = ext, DeclaredSize = body.Size,
            Status = UploadStatus.Waiting, CreatedAt = DateTime.UtcNow,
        };
        upload.StorageKey = $"uploads/{upload.Id}{ext}";
        db.Uploads.Add(upload);
        await db.SaveChangesAsync();

        var expires = DateTime.UtcNow.Add(UploadLinkLife);
        return Results.Created($"/v1/uploads/{upload.Id}", new
        {
            upload.Id,
            UploadUrl = store.UploadUrl(BaseUrl(http.Request), upload.StorageKey, expires),
            Method = "PUT",
            ExpiresAt = expires,
        });
    }

    // Nhận nội dung file (thân request là file thô, không phải form). Ghi thẳng xuống kho theo luồng,
    // nên file vài trăm MB cũng không chiếm bộ nhớ của API.
    static async Task<IResult> PutFile(string key, long exp, string? sig, HttpContext http, AppDb db, LocalFileStore store)
    {
        if (sig is null || !store.Verify("PUT", key, exp, null, sig))
            return Results.Json(new { error = "Link tải lên không hợp lệ hoặc đã hết hạn." }, statusCode: StatusCodes.Status403Forbidden);

        var upload = await db.Uploads.FirstOrDefaultAsync(u => u.StorageKey == key);
        if (upload is null) return NotFound("Không tìm thấy chỗ tải lên.");
        if (upload.Status == UploadStatus.Uploaded) return Results.Conflict(new { error = "File này đã được tải lên rồi." });
        if (http.Request.ContentLength is long length && length != upload.DeclaredSize)
            return BadRequest($"Dung lượng gửi lên ({length} byte) khác dung lượng đã khai ({upload.DeclaredSize} byte).");

        // Giới hạn chung 100 MB là cho form của trang web; ở đây cho phép đúng bằng dung lượng đã khai.
        if (http.Features.Get<IHttpMaxRequestBodySizeFeature>() is { IsReadOnly: false } limit)
            limit.MaxRequestBodySize = upload.DeclaredSize;

        try
        {
            await using var output = store.OpenWrite(key);
            await http.Request.Body.CopyToAsync(output, http.RequestAborted);
        }
        catch (Exception e) when (e is BadHttpRequestException or IOException or OperationCanceledException)
        {
            store.Delete(key);
            return BadRequest("Tải lên bị gián đoạn hoặc vượt dung lượng đã khai. Hãy tải lại.");
        }

        var size = store.Size(key);
        if (size != upload.DeclaredSize)
        {
            store.Delete(key);
            return BadRequest($"Nhận được {size} byte, khác dung lượng đã khai ({upload.DeclaredSize} byte). Hãy tải lại.");
        }

        upload.Size = size;
        upload.Status = UploadStatus.Uploaded;
        await db.SaveChangesAsync();
        return Results.Ok(new { upload.Id, upload.Size });
    }

    static IResult GetFile(string key, long exp, string? sig, string? name, LocalFileStore store)
    {
        if (sig is null || !store.Verify("GET", key, exp, name, sig))
            return Results.Json(new { error = "Link tải về không hợp lệ hoặc đã hết hạn." }, statusCode: StatusCodes.Status403Forbidden);
        if (!store.Exists(key)) return NotFound("File không còn trên máy chủ.");
        var fileName = string.IsNullOrEmpty(name) ? Path.GetFileName(key) : name;
        return Results.Stream(store.OpenRead(key), JobHelpers.ContentType(fileName), fileName, enableRangeProcessing: true);
    }

    // ---------- Lô ----------

    static async Task<IResult> CreateBatch(BatchRequest body, HttpContext http, AppDb db)
    {
        var client = Client(http);

        // Gửi lại cùng Idempotency-Key (ví dụ mạng chập chờn nên app gửi lại) thì trả về lô đã tạo, không tạo thêm.
        var idemKey = http.Request.Headers["Idempotency-Key"].ToString().Trim();
        if (idemKey.Length > 100) return BadRequest("Idempotency-Key tối đa 100 ký tự.");
        if (idemKey != "" && await FindByIdempotencyKey(db, client.Id, idemKey) is { } existing)
            return Results.Ok(await BatchView(db, existing));

        if (body.Type is null || !JobCatalog.Types.TryGetValue(body.Type, out var jobType))
            return BadRequest($"Không hỗ trợ loại job '{body.Type}'. Xem danh sách ở GET /v1/job-types.");
        if (jobType.Input != "file")
            return BadRequest("Qua API v1 hiện chỉ dùng được các công cụ nhận file.");

        var ids = (body.UploadIds ?? []).Distinct().ToList();
        if (ids.Count == 0) return BadRequest("Cần ít nhất một file (uploadIds).");
        if (ids.Count > MaxBatchFiles) return BadRequest($"Mỗi lô tối đa {MaxBatchFiles} file.");

        var uploads = await db.Uploads.AsNoTracking().Where(u => u.ClientId == client.Id && ids.Contains(u.Id)).ToDictionaryAsync(u => u.Id);
        foreach (var id in ids)
        {
            if (!uploads.TryGetValue(id, out var u)) return BadRequest($"Không tìm thấy file {id}.");
            if (u.Status != UploadStatus.Uploaded) return BadRequest($"File {u.FileName} chưa tải lên xong.");
            if (!jobType.Extensions.Contains(u.Ext))
                return BadRequest($"File {u.FileName}: công cụ này chỉ nhận {string.Join(", ", jobType.Extensions)}.");
        }

        var rawOptions = body.Options ?? [];
        var (options, error) = JobHelpers.ValidateOptions(jobType, name => rawOptions.TryGetValue(name, out var v) ? JsonText(v) : null);
        if (error is not null) return BadRequest(error);

        var now = DateTime.UtcNow;
        var batch = new Batch
        {
            Id = Guid.NewGuid(), ClientId = client.Id, Type = body.Type, Options = JsonSerializer.Serialize(options),
            ExternalId = string.IsNullOrWhiteSpace(body.ExternalId) ? null : body.ExternalId.Trim()[..Math.Min(body.ExternalId.Trim().Length, 200)],
            IdempotencyKey = idemKey == "" ? null : idemKey, CreatedAt = now,
        };
        db.Batches.Add(batch);
        for (var i = 0; i < ids.Count; i++)
        {
            var u = uploads[ids[i]];
            db.Jobs.Add(new Job
            {
                Id = Guid.NewGuid(), Type = body.Type, Status = JobStatus.Pending, OriginalName = u.FileName,
                InputFile = u.StorageKey, Options = batch.Options, ClientId = client.Id, BatchId = batch.Id, UploadId = u.Id,
                Priority = JobHelpers.BatchPriority,
                // Cộng thêm vài tick để giữ đúng thứ tự file app khách gửi (worker nhận theo CreatedAt).
                CreatedAt = now.AddTicks(i), UpdatedAt = now,
            });
        }

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException) when (batch.IdempotencyKey is not null)
        {
            // Hai yêu cầu cùng Idempotency-Key tới cùng lúc: yêu cầu kia đã tạo lô trước.
            db.ChangeTracker.Clear();
            if (await FindByIdempotencyKey(db, client.Id, batch.IdempotencyKey) is { } other)
                return Results.Ok(await BatchView(db, other));
            throw;
        }

        return Results.Created($"/v1/batches/{batch.Id}", await BatchView(db, batch));
    }

    static Task<Batch?> FindByIdempotencyKey(AppDb db, Guid clientId, string key) =>
        db.Batches.AsNoTracking().FirstOrDefaultAsync(b => b.ClientId == clientId && b.IdempotencyKey == key);

    static async Task<object> BatchView(AppDb db, Batch b)
    {
        var jobs = await db.Jobs.AsNoTracking().Where(j => j.BatchId == b.Id).OrderBy(j => j.CreatedAt).ToListAsync();
        int Count(JobStatus s) => jobs.Count(j => j.Status == s);
        var counts = new
        {
            Total = jobs.Count, Pending = Count(JobStatus.Pending), Processing = Count(JobStatus.Processing),
            Done = Count(JobStatus.Done), Failed = Count(JobStatus.Failed), Cancelled = Count(JobStatus.Cancelled),
        };
        return new
        {
            b.Id, b.Type, Label = JobHelpers.Label(b.Type), b.ExternalId,
            Options = JsonSerializer.Deserialize<Dictionary<string, string>>(b.Options),
            b.CreatedAt,
            Finished = counts.Pending + counts.Processing == 0,
            Counts = counts,
            Jobs = jobs.Select(JobView),
        };
    }

    static object JobView(Job j) => new
    {
        j.Id, j.BatchId, j.UploadId, FileName = j.OriginalName, Status = j.Status.ToString(), j.Error, j.Attempts,
        HasResult = j.Status == JobStatus.Done && j.OutputFile is not null,
        j.CreatedAt, j.UpdatedAt,
    };

    // ---------- Tiện ích ----------

    // Tuỳ chọn gửi dạng JSON có thể là chuỗi, số hoặc true/false: đổi hết về chuỗi như form của trang web.
    static string? JsonText(JsonElement v) => v.ValueKind switch
    {
        JsonValueKind.String => v.GetString(),
        JsonValueKind.Null or JsonValueKind.Undefined => null,
        JsonValueKind.True => "true",
        JsonValueKind.False => "false",
        _ => v.GetRawText(),
    };

    static string BaseUrl(HttpRequest r) => $"{r.Scheme}://{r.Host}";
    static IResult BadRequest(string error) => Results.BadRequest(new { error });
    static IResult NotFound(string error) => Results.NotFound(new { error });
    static IResult Unauthorized(string error) => Results.Json(new { error }, statusCode: StatusCodes.Status401Unauthorized);
}
