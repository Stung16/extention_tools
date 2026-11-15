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
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
