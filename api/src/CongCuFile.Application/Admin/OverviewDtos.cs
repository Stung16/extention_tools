namespace CongCuFile.Application.Admin;

// Số liệu tổng quan cho app giám sát (GET /api/admin/overview). Tên thuộc tính chính là tên trường JSON
// (đổi sang camelCase) mà app giám sát đọc: đổi tên ở đây thì phải sửa monitor/ui/app.js theo.

public sealed record OverviewDto(
    DateTime ServerTime,
    StatusTotalsDto Totals,
    Last24hDto Last24h,
    double? OldestPendingSeconds,
    IEnumerable<WorkerGroupDto> Workers,
    IEnumerable<JobTypeStatsDto> Types,
    IEnumerable<RunningJobDto> Running,
    IEnumerable<WaitingJobDto> Waiting,
    IEnumerable<RecentJobDto> Recent,
    StorageUsageDto Storage);

public sealed record StatusTotalsDto(int Pending, int Processing, int Done, int Failed, int Cancelled);

// AvgSeconds: thời gian "từ lúc gửi tới lúc xong" (gồm cả thời gian chờ trong hàng).
public sealed record Last24hDto(int Done, int Failed, int Cancelled, double? AvgSeconds);

public sealed record WorkerGroupDto(string Name, bool Online, double? LastSeenSecondsAgo, int Types, int Pending, int Processing);

public sealed record JobTypeStatsDto(
    string Type, string Label, string Worker, bool Online, int Pending, int Processing, int Done24h, int Failed24h, double? AvgSeconds24h);

public sealed record RunningJobDto(
    Guid Id, string Type, string Label, string Worker, string Name, string Source, Guid? BatchId,
    int Attempt, double Seconds, double? LeaseSecondsLeft);

public sealed record WaitingJobDto(
    Guid Id, string Type, string Label, string Worker, string Name, string Source, Guid? BatchId, int Attempts, double WaitSeconds);

public sealed record RecentJobDto(
    Guid Id, string Type, string Label, string Worker, string Name, string Source, Guid? BatchId, string Status,
    int Attempts, string? Error, double Seconds, double AgoSeconds);

public sealed record StorageUsageDto(int Files, long Bytes);
