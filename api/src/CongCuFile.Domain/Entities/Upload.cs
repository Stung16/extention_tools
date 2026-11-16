using CongCuFile.Domain.Enums;

namespace CongCuFile.Domain.Entities;

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

    public void MarkUploaded(long size)
    {
        Size = size;
        Status = UploadStatus.Uploaded;
    }
}
