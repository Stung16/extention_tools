namespace CongCuFile.Domain.Entities;

// Một app khách gọi API v1 (ví dụ web nhiếp ảnh gia). Khoá API chỉ hiện một lần lúc tạo;
// database chỉ giữ mã băm (hash) của khoá, nên lộ database cũng không lấy được khoá.
public class ApiClient
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public string KeyPrefix { get; set; } = "";   // vài ký tự đầu của khoá, để nhận ra khoá nào mà không lộ khoá
    public string KeyHash { get; set; } = "";     // SHA-256 của khoá
    public DateTime CreatedAt { get; set; }
    public bool Disabled { get; set; }
}
