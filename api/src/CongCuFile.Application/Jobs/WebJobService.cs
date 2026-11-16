using System.Text.RegularExpressions;
using CongCuFile.Application.Abstractions;
using CongCuFile.Application.Common;
using CongCuFile.Application.Storage;
using CongCuFile.Application.Workers;
using CongCuFile.Domain.Catalog;
using CongCuFile.Domain.Entities;
using CongCuFile.Domain.Enums;
using CongCuFile.Domain.Jobs;

namespace CongCuFile.Application.Jobs;

public sealed record CreatedJobDto(Guid Id, string Status);

public sealed record WebJobStatusDto(
    Guid Id, string Type, string Status, Dictionary<string, string> Options, string? Error,
    long InputSize, long? OutputSize, string? OutputExt, bool WorkerOnline, DateTime CreatedAt, DateTime UpdatedAt);

// Nghiệp vụ cho trang web công cụ (người dùng ẩn danh): tạo job, xem trạng thái, lấy kết quả.
public sealed class WebJobService(
    IJobRepository jobs, IUnitOfWork unitOfWork, IFileStore store, WorkerPresence presence, UploadSettings limits, IClock clock)
{
    // fields: các ô của form (tuỳ chọn, "url"); file: file tải lên (với công cụ nhận file).
    public async Task<Result<CreatedJobDto>> CreateAsync(
        string type, IReadOnlyDictionary<string, string> fields, IncomingFile? file, CancellationToken ct)
    {
        if (!JobCatalog.TryGet(type, out var jobType))
            return Error.Validation($"Không hỗ trợ loại job '{type}'.");

        // Trình duyệt đã kiểm tra trước, nhưng API phải kiểm tra lại vì người khác có thể gọi thẳng API.
        var (options, error) = JobOptionsValidator.Validate(jobType, name => fields.GetValueOrDefault(name));
        if (error is not null) return Error.Validation(error);

        var now = clock.UtcNow;
        var job = new Job
        {
            Id = Guid.NewGuid(),
            Type = type,
            Status = JobStatus.Pending,
            Priority = JobPolicy.WebPriority,
            CreatedAt = now,
            UpdatedAt = now,
        };

        switch (jobType.Input)
        {
            case "none":
                // Công cụ chỉ cần chữ người dùng nhập (đọc văn bản...): không có file đầu vào.
                job.OriginalName = "ket-qua";
                break;

            case "url":
                // Công cụ dạng đường link (ví dụ YouTube): không có file, lưu link vào tuỳ chọn "url".
                var url = fields.GetValueOrDefault("url")?.Trim() ?? "";
                if (url == "") return Error.Validation("Vui lòng dán đường link.");
                if (url.Length > 500 || (jobType.UrlPattern is not null && !Regex.IsMatch(url, jobType.UrlPattern)))
                    return Error.Validation("Đường link không hợp lệ cho công cụ này.");
                options!["url"] = url;
                job.OriginalName = "ket-qua";
                break;

            default:
                if (file is null || file.Length == 0) return Error.Validation("Thiếu file.");
                if (file.Length > limits.WebMaxBytes)
                    return Error.Validation($"File quá lớn: tối đa {limits.WebMaxBytes / 1024 / 1024} MB.");

                var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
                if (!jobType.Extensions.Contains(ext))
                    return Error.Validation($"Công cụ này chỉ nhận file: {string.Join(", ", jobType.Extensions)}.");

                job.OriginalName = Path.GetFileName(file.FileName);
                // Khoá file do mình đặt (theo Id), không dùng tên người dùng gửi lên.
                job.InputFile = FileKeys.WebInput(job.Id, ext);
                await using (var output = store.OpenWrite(job.InputFile))
                {
                    await file.Content.CopyToAsync(output, ct);
                }
                break;
        }

        job.WriteOptions(options!);
        jobs.Add(job);
        await unitOfWork.SaveChangesAsync(ct);
        return new CreatedJobDto(job.Id, job.Status.ToString());
    }

    public async Task<Result<WebJobStatusDto>> GetStatusAsync(Guid id, CancellationToken ct)
    {
        var job = await jobs.FindAsync(id, ct);
        if (job is null) return Error.NotFound("Không tìm thấy job.");
        return new WebJobStatusDto(
            job.Id, job.Type, job.Status.ToString(), job.ReadOptions(hideSecrets: true), job.Error,
            // Dung lượng file vào/ra (byte), để trang web hiện kiểu "5,8 MB còn 340 KB".
            InputSize: job.InputFile == "" ? 0 : store.Size(job.InputFile),
            OutputSize: job.OutputFile is null ? null : store.Size(job.OutputFile),
            // Đuôi file kết quả (.mp3, .pdf...): trang web dùng để hiện trình nghe thử với file âm thanh.
            OutputExt: job.OutputFile is null ? null : Path.GetExtension(job.OutputFile),
            // Máy xử lý loại job này có đang bật không (để trang báo khi phải chờ lâu).
            WorkerOnline: presence.IsOnline(job.Type),
            job.CreatedAt, job.UpdatedAt);
    }

    public async Task<Result<FileDownload>> OpenOutputAsync(Guid id, CancellationToken ct)
    {
        var job = await jobs.FindAsync(id, ct);
        if (job is null) return Error.NotFound("Không tìm thấy job.");
        if (!job.HasResult) return Error.Conflict($"Job chưa xong (trạng thái: {job.Status}).");
        if (!store.Exists(job.OutputFile!)) return Error.NotFound("File kết quả không còn trên máy chủ.");
        return new FileDownload(store.OpenRead(job.OutputFile!), job.DownloadName());
    }
}
