namespace CongCuFile.Application.Common;

// Giờ hiện tại (UTC). Dùng interface thay vì DateTime.UtcNow để test được các quy tắc theo thời gian
// (hết hạn giữ job, link hết hạn) mà không phải chờ thật.
public interface IClock
{
    DateTime UtcNow { get; }
}

// File người dùng / worker gửi lên (tầng Api đổi IFormFile sang kiểu này để nghiệp vụ không phụ thuộc ASP.NET).
public sealed record IncomingFile(string FileName, long Length, Stream Content);

// File trả về để tải xuống. Tầng Api tự chọn Content-Type theo đuôi của FileName.
public sealed record FileDownload(Stream Content, string FileName);

// Database báo trùng khoá duy nhất (ví dụ hai yêu cầu cùng Idempotency-Key tới cùng lúc).
public sealed class UniqueConstraintException(string message, Exception inner) : Exception(message, inner);

// Thời gian giữ job: worker gửi "tín hiệu sống" mỗi 30 giây, mỗi lần gia hạn LeaseTime (mặc định 2 phút).
public sealed record JobLeaseSettings(TimeSpan LeaseTime);

// Giới hạn dung lượng: form tải lên của trang web, và file tải lên qua API v1.
public sealed record UploadSettings(long WebMaxBytes, long ApiMaxBytes);

// Thời gian giữ file trước khi tự xoá (tính từ lúc job kết thúc / lúc tải lên).
//   WebFiles     file gốc + kết quả của job trang web (người dùng tải về ngay, nên giữ ngắn)
//   ClientFiles  file kết quả và file tải lên của app khách (API v1); phải dài hơn link tải về (6 giờ)
public sealed record RetentionSettings(TimeSpan WebFiles, TimeSpan ClientFiles);
