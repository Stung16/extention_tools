namespace Api;

// Trạng thái của một job: Pending -> Processing -> Done / Failed
public enum JobStatus
{
    Pending,     // vừa tạo, đang chờ worker nhận
    Processing,  // worker đã nhận, đang xử lý
    Done,        // xong, đã có file kết quả
    Failed       // lỗi, xem cột Error
}

// Một dòng trong bảng Jobs
public class Job
{
    // Dùng Guid (chuỗi ngẫu nhiên dài) thay vì số 1, 2, 3...
    // để người khác không đoán được Id rồi tải file của người dùng khác.
    public Guid Id { get; set; }

    public string Type { get; set; } = "";          // loại job, ví dụ "word-to-pdf"
    public JobStatus Status { get; set; }
    public string OriginalName { get; set; } = "";  // tên file người dùng tải lên
    public string InputFile { get; set; } = "";     // tên file đầu vào trong thư mục data/files
    public string? OutputFile { get; set; }         // tên file kết quả (có khi Done)
    public string? Error { get; set; }              // lý do lỗi (có khi Failed)
    public string Options { get; set; } = "{}";     // tuỳ chọn người dùng chọn, dạng JSON, ví dụ {"level":"5"}
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    // Số lần job đã được giao cho worker (lượt 1, 2, 3...). Worker gửi kèm số lượt khi báo xong/lỗi,
    // để worker của lượt cũ (bị coi là đã chết) không ghi đè kết quả của lượt mới.
    public int Attempts { get; set; }

    // Hạn giữ job: worker đang xử lý phải gia hạn (gửi "tín hiệu sống") trước hạn này.
    // Quá hạn mà không gia hạn -> coi như worker đã chết, job được trả về hàng chờ.
    public DateTime? LeaseUntil { get; set; }
}
