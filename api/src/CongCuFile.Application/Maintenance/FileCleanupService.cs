using CongCuFile.Application.Abstractions;
using CongCuFile.Application.Common;

namespace CongCuFile.Application.Maintenance;

public sealed record CleanupReport(int Jobs, int Uploads, int Files);

// Tự xoá file cũ để ổ đĩa không đầy và không giữ file của người dùng lâu hơn cần thiết.
// Chạy định kỳ trong nền (Api/Background/FileCleanupWorker.cs), mặc định 10 phút một lần.
//
//   Job trang web kết thúc quá RetentionSettings.WebFiles     -> xoá file gốc + file kết quả
//   Job app khách kết thúc quá RetentionSettings.ClientFiles  -> xoá file kết quả
//     (file gốc của job app khách là file tải lên, dùng chung cho nhiều job: dọn theo từng file tải lên, bên dưới)
//   File tải lên quá ClientFiles, không còn job đang chờ / đang chạy cần tới -> xoá file, đánh dấu Expired
//
// Job đang chờ / đang chạy không bao giờ bị xoá file. Dòng job vẫn giữ (đánh dấu FilesDeletedAt) cho lịch sử,
// thống kê; tải kết quả sau đó nhận lỗi 410 với câu báo rõ ràng.
public sealed class FileCleanupService(
    IJobRepository jobs, IUploadRepository uploads, IUnitOfWork unitOfWork, IFileStore store, RetentionSettings retention, IClock clock)
{
    private const int BatchSize = 200; // mỗi lượt nạp tối đa chừng này dòng, để không tốn bộ nhớ khi tồn nhiều

    public async Task<CleanupReport> RunOnceAsync(CancellationToken ct)
    {
        var now = clock.UtcNow;
        var jobCount = 0;
        var uploadCount = 0;
        var fileCount = 0;

        while (true)
        {
            var expired = await jobs.ListWithExpiredFilesAsync(now - retention.WebFiles, now - retention.ClientFiles, BatchSize, ct);
            foreach (var job in expired)
            {
                if (job.ClientId is null) fileCount += DeleteFile(job.InputFile);
                fileCount += DeleteFile(job.OutputFile);
                job.MarkFilesDeleted(now);
            }
            await unitOfWork.SaveChangesAsync(ct);
            jobCount += expired.Count;
            if (expired.Count < BatchSize) break;
        }

        while (true)
        {
            var expired = await uploads.ListExpiredAsync(now - retention.ClientFiles, BatchSize, ct);
            foreach (var upload in expired)
            {
                fileCount += DeleteFile(upload.StorageKey);
                upload.MarkExpired();
            }
            await unitOfWork.SaveChangesAsync(ct);
            uploadCount += expired.Count;
            if (expired.Count < BatchSize) break;
        }

        return new CleanupReport(jobCount, uploadCount, fileCount);
    }

    // Trả về 1 nếu đã xoá một file, 0 nếu không có gì để xoá.
    private int DeleteFile(string? key)
    {
        if (string.IsNullOrEmpty(key) || !store.Exists(key)) return 0;
        store.Delete(key);
        return 1;
    }
}
