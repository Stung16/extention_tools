namespace CongCuFile.Domain.Enums;

// Trạng thái của một job: Pending -> Processing -> Done / Failed. Job đang chờ có thể bị huỷ (Cancelled).
public enum JobStatus
{
    Pending,     // vừa tạo, đang chờ worker nhận
    Processing,  // worker đã nhận, đang xử lý
    Done,        // xong, đã có file kết quả
    Failed,      // lỗi, xem Error
    Cancelled,   // bị huỷ khi còn đang chờ (bởi người quản lý hoặc app khách)
}
