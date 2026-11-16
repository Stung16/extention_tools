namespace Api;

// Các bảng dùng cho app khách gọi qua API v1 (ví dụ web nhiếp ảnh gia).

// Một app khách. Khoá API chỉ hiện một lần lúc tạo; database chỉ giữ mã băm (hash) của khoá,
// nên lộ database cũng không lấy được khoá.
public class ApiClient
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public string KeyPrefix { get; set; } = "";   // vài ký tự đầu của khoá, để nhận ra khoá nào mà không lộ khoá
    public string KeyHash { get; set; } = "";     // SHA-256 của khoá
    public DateTime CreatedAt { get; set; }
    public bool Disabled { get; set; }
}

public enum UploadStatus
{
    Waiting,   // đã cấp link tải lên, chưa nhận đủ file
    Uploaded   // đã nhận đủ file
}

// Một file app khách tải lên, để dùng làm đầu vào cho các lô.
// Một file dùng được cho nhiều lô (ví dụ cùng một ảnh RAW, rửa theo hai kiểu khác nhau).
public class Upload
{
    public Guid Id { get; set; }
    public Guid ClientId { get; set; }
    public string FileName { get; set; } = "";
    public string Ext { get; set; } = "";
    public long DeclaredSize { get; set; }        // dung lượng app khách khai lúc xin chỗ
    public long Size { get; set; }                // dung lượng thật đã nhận
    public string StorageKey { get; set; } = "";  // khoá trong kho file
    public UploadStatus Status { get; set; }
    public DateTime CreatedAt { get; set; }
}

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
