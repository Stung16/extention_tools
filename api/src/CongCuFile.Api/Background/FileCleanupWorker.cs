using CongCuFile.Application.Maintenance;

namespace CongCuFile.Api.Background;

// Chạy dọn file cũ định kỳ trong lúc API đang chạy (mặc định 10 phút một lần, Cleanup:IntervalMinutes).
// Đặt Cleanup:IntervalMinutes = 0 để tắt (ví dụ trong test). Việc dọn thật nằm ở FileCleanupService.
public sealed partial class FileCleanupWorker(IServiceScopeFactory scopes, IConfiguration configuration, ILogger<FileCleanupWorker> log)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var minutes = configuration.GetValue("Cleanup:IntervalMinutes", 10.0);
        if (minutes <= 0)
        {
            LogDisabled(log);
            return;
        }

        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(minutes));
        do
        {
            await RunOnceAsync(stoppingToken);
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    private async Task RunOnceAsync(CancellationToken ct)
    {
        try
        {
            // Service dùng database (scoped): mỗi lượt dọn một scope riêng.
            using var scope = scopes.CreateScope();
            var report = await scope.ServiceProvider.GetRequiredService<FileCleanupService>().RunOnceAsync(ct);
            if (report.Files > 0 || report.Jobs > 0 || report.Uploads > 0)
                LogCleaned(log, report.Files, report.Jobs, report.Uploads);
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            // Lỗi một lượt (ổ đĩa bận, database khoá...) không được làm dừng API: ghi log, lượt sau thử lại.
            LogFailed(log, e);
        }
    }

    // Câu log khai báo sẵn: .NET sinh code ghi log nhanh, không tốn công khi mức log đang tắt.
    [LoggerMessage(Level = LogLevel.Information, Message = "Đã tắt tự dọn file cũ (Cleanup:IntervalMinutes = 0).")]
    private static partial void LogDisabled(ILogger logger);

    [LoggerMessage(Level = LogLevel.Information, Message = "Đã dọn {Files} file cũ ({Jobs} job, {Uploads} file tải lên).")]
    private static partial void LogCleaned(ILogger logger, int files, int jobs, int uploads);

    [LoggerMessage(Level = LogLevel.Error, Message = "Dọn file cũ thất bại, sẽ thử lại ở lượt sau.")]
    private static partial void LogFailed(ILogger logger, Exception exception);
}
