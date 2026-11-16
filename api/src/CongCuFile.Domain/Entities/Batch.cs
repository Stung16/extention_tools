namespace CongCuFile.Domain.Entities;

// Một lô: nhiều file, cùng một loại job và cùng tuỳ chọn. Mỗi file thành một job riêng.
// Tiến độ của lô tính từ trạng thái các job (không lưu trùng ở đây).
public class Batch
{
    public Guid Id { get; set; }
    public Guid ClientId { get; set; }
    public string Type { get; set; } = "";
    public string Options { get; set; } = "{}";
    public string? ExternalId { get; set; }       // mã do app khách tự đặt (ví dụ mã đơn hàng), để tra ngược
    public string? IdempotencyKey { get; set; }   // chống tạo trùng khi app khách gửi lại cùng một yêu cầu
    public DateTime CreatedAt { get; set; }
}
