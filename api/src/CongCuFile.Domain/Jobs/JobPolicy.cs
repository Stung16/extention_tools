using CongCuFile.Domain.Enums;

namespace CongCuFile.Domain.Jobs;

// Các quy tắc chung về job.
public static class JobPolicy
{
    // Job lẻ của trang web được làm trước job trong lô của app khách,
    // để người dùng trang web không phải chờ sau một lô hàng trăm ảnh.
    public const int WebPriority = 10;
    public const int BatchPriority = 0;

    // Một job làm sập worker quá 3 lần (ví dụ file quá nặng làm tràn bộ nhớ GPU) thì báo lỗi luôn, không thử nữa.
    public const int MaxAttempts = 3;

    // Worker hỏi việc mỗi 3 giây; quá 30 giây không thấy hỏi thì coi như máy xử lý đang tắt.
    public static readonly TimeSpan WorkerOnlineWindow = TimeSpan.FromSeconds(30);

    public static bool CanRetry(JobStatus status) => status is JobStatus.Failed or JobStatus.Cancelled;

    // Job đã kết thúc (không còn ai cần tới file của nó, trừ người tải kết quả về).
    public static bool IsFinished(JobStatus status) => status is JobStatus.Done or JobStatus.Failed or JobStatus.Cancelled;

    public const string FilesDeletedMessage =
        "File đã được tự động xoá khỏi máy chủ vì hết thời gian lưu. Hãy gửi lại file để xử lý lần nữa.";

    public static string AbandonedError(int attempts) =>
        $"Máy xử lý bị dừng giữa chừng {attempts} lần với file này. File có thể quá nặng; hãy thử file nhỏ hơn hoặc thử lại sau.";
}
