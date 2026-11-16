using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;

namespace Api;

// Các mã bí mật lấy từ cấu hình.
public record Secrets(string WorkerKey, string AdminKey);

// Giới hạn dung lượng: form tải lên của trang web (100 MB) và file tải lên qua API v1 (mặc định 1 GB).
public record UploadLimits(long WebBytes, long ApiBytes);

// Trạng thái dùng chung khi API đang chạy: máy xử lý nào đang bật, giữ job bao lâu.
public class JobRuntime(TimeSpan leaseTime)
{
    // Một job làm sập worker quá 3 lần (ví dụ file quá nặng làm tràn bộ nhớ GPU) thì báo lỗi luôn, không thử nữa.
    public const int MaxAttempts = 3;

    // Giữ job: worker đang xử lý gửi "tín hiệu sống" mỗi 30 giây, mỗi lần gia hạn thêm 2 phút (JobLeaseSeconds).
    public TimeSpan LeaseTime { get; } = leaseTime;

    // Lần cuối mỗi loại job có worker hỏi tới. Worker hỏi mỗi 3 giây, nên quá 30 giây không thấy hỏi
    // thì coi như máy xử lý loại job đó đang tắt. Chỉ lưu trong bộ nhớ: API khởi động lại thì quên.
    readonly ConcurrentDictionary<string, DateTime> lastSeen = new();

    public void Seen(string type) => lastSeen[type] = DateTime.UtcNow;
    public DateTime? LastSeen(string type) => lastSeen.TryGetValue(type, out var t) ? t : null;
    public bool IsOnline(string type) => LastSeen(type) is { } t && DateTime.UtcNow - t < TimeSpan.FromSeconds(30);

    // Tìm job "đang xử lý" đã quá hạn giữ (worker không còn gửi tín hiệu sống) và xử lý lại.
    // Gọi mỗi khi có worker hỏi việc: job bị bỏ rơi chỉ có ý nghĩa khi có worker sẵn sàng làm lại.
    public async Task RecoverAbandonedJobs(AppDb db)
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
        var dead = await db.Jobs.Where(j => j.Status == JobStatus.Processing && j.LeaseUntil < now).ToListAsync();
        foreach (var job in dead)
        {
            job.Status = JobStatus.Failed;
            job.Error = $"Máy xử lý bị dừng giữa chừng {job.Attempts} lần với file này. " +
                        "File có thể quá nặng; hãy thử file nhỏ hơn hoặc thử lại sau.";
            job.LeaseUntil = null;
            job.UpdatedAt = now;
            JobHelpers.ForgetSecrets(job);
        }
        if (dead.Count > 0) await db.SaveChangesAsync();
    }
}

public static class JobHelpers
{
    public const int WebPriority = 10;   // job lẻ từ trang web
    public const int BatchPriority = 0;  // job trong lô của app khách

    static readonly Microsoft.AspNetCore.StaticFiles.FileExtensionContentTypeProvider ContentTypes = new();

    public static string Label(string type) => JobCatalog.Types.TryGetValue(type, out var t) ? t.Label : type;
    public static string WorkerOf(string type) => JobCatalog.Types.TryGetValue(type, out var t) ? t.Worker : "?";

    public static string ContentType(string fileName) =>
        ContentTypes.TryGetContentType(fileName, out var ct) ? ct : "application/octet-stream";

    // Đổi cột Options (chuỗi JSON) thành danh sách tên -> giá trị.
    // hideSecrets = true: bỏ các tuỳ chọn bí mật (mật khẩu) trước khi trả ra ngoài.
    public static Dictionary<string, string> ReadOptions(Job job, bool hideSecrets = false)
    {
        var options = JsonSerializer.Deserialize<Dictionary<string, string>>(job.Options) ?? [];
        if (hideSecrets)
            foreach (var name in SecretNames(job.Type)) options.Remove(name);
        return options;
    }

    // Tên các tuỳ chọn bí mật của loại job này (Kind = "password").
    static IEnumerable<string> SecretNames(string type) =>
        JobCatalog.Types.TryGetValue(type, out var t) ? t.Options.Where(o => o.Kind == "password").Select(o => o.Name) : [];

    // Job xong hoặc lỗi thì không cần mật khẩu nữa: xoá khỏi database, không để nằm lại.
    public static void ForgetSecrets(Job job) => job.Options = JsonSerializer.Serialize(ReadOptions(job, hideSecrets: true));

    // Tên khi tải kết quả về: tên file gốc + đuôi của kết quả. Kết quả cùng đuôi với file gốc (nén...)
    // thì thêm "-ket-qua" để người dùng không nhầm với file gốc.
    public static string DownloadName(Job job)
    {
        var outExt = Path.GetExtension(job.OutputFile ?? "");
        var stem = Path.GetFileNameWithoutExtension(job.OriginalName);
        var sameExt = string.Equals(Path.GetExtension(job.OriginalName), outExt, StringComparison.OrdinalIgnoreCase);
        return stem + (sameExt && job.InputFile != "" ? "-ket-qua" : "") + outExt;
    }

    // Kiểm tra từng tuỳ chọn theo khai báo trong JobCatalog. Dùng chung cho trang web (form) và API v1 (JSON).
    // getValue(tên) trả về giá trị người dùng gửi, hoặc null nếu không gửi.
    public static (Dictionary<string, string>? Options, string? Error) ValidateOptions(JobTypeInfo jobType, Func<string, string?> getValue)
    {
        var options = new Dictionary<string, string>();
        foreach (var opt in jobType.Options)
        {
            var value = getValue(opt.Name) ?? "";
            if (opt.Kind is "text" or "textarea") value = value.Trim(); // mật khẩu thì giữ nguyên, kể cả dấu cách
            if (value == "")
            {
                if (opt.Required) return (null, $"Vui lòng nhập: {opt.Label}.");
                value = opt.Default;
            }

            if (opt.Choices is { Length: > 0 } choices)
            {
                if (!choices.Any(c => c.Value == value))
                    return (null, $"Giá trị '{value}' không hợp lệ cho tuỳ chọn '{opt.Label}'.");
            }
            else
            {
                if (value.Length > opt.MaxLength)
                    return (null, $"{opt.Label}: tối đa {opt.MaxLength} ký tự.");
                if (opt.Pattern is not null && !Regex.IsMatch(value, opt.Pattern))
                    return (null, $"{opt.Label} không đúng dạng. {opt.Hint}".Trim());
            }
            options[opt.Name] = value;
        }
        return (options, null);
    }
}

public static class ApiKeys
{
    // Khoá API cho app khách: "ccf_" + 32 byte ngẫu nhiên (đủ để không ai đoán được).
    public static string Generate() => "ccf_" + WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(32));

    public static string Hash(string key) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(key)));

    // So sánh mã bí mật trong thời gian không đổi (không để lộ mã qua thời gian phản hồi).
    public static bool SameSecret(string? given, string expected) =>
        CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(given ?? ""), Encoding.UTF8.GetBytes(expected));
}

public static class KeyFilters
{
    // Chỉ cho qua khi header mang đúng mã bí mật (X-Worker-Key cho worker, X-Admin-Key cho app giám sát).
    public static TBuilder RequireSecretHeader<TBuilder>(this TBuilder builder, string header, Func<Secrets, string> pick)
        where TBuilder : IEndpointConventionBuilder =>
        builder.AddEndpointFilter(async (ctx, next) =>
        {
            var secrets = ctx.HttpContext.RequestServices.GetRequiredService<Secrets>();
            return ApiKeys.SameSecret(ctx.HttpContext.Request.Headers[header].ToString(), pick(secrets))
                ? await next(ctx)
                : Results.Json(new { error = $"Thiếu hoặc sai {header}." }, statusCode: StatusCodes.Status401Unauthorized);
        });
}
