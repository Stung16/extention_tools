namespace CongCuFile.Application.Abstractions;

// "Kho file": nơi lưu file đầu vào và kết quả. Nghiệp vụ chỉ làm việc qua interface này,
// nên đổi từ ổ đĩa sang kho kiểu S3 (MinIO, Cloudflare R2...) chỉ cần thêm một bản cài đặt ở Infrastructure.
// Khoá (key) là "đường dẫn" của file trong kho, ví dụ "uploads/<guid>.arw" (xem FileKeys).
public interface IFileStore
{
    Stream OpenWrite(string key);
    Stream OpenRead(string key);
    bool Exists(string key);
    long Size(string key);
    void Delete(string key);

    // Tổng số file và dung lượng đang lưu (cho trang tổng quan).
    (int Files, long Bytes) Usage();

    // Link có thời hạn để tải file lên (PUT) hoặc tải về (GET) mà không cần khoá API.
    // Bản ổ đĩa: link trỏ về API, kèm chữ ký. Bản S3: link "presigned" trỏ thẳng vào kho.
    string UploadUrl(string baseUrl, string key, DateTime expiresUtc);
    string DownloadUrl(string baseUrl, string key, string fileName, DateTime expiresUtc);
}

// Kiểm tra link có chữ ký do chính kho cấp (chỉ kho ổ đĩa cần; với S3, kho tự kiểm tra).
public interface ISignedLinkVerifier
{
    bool Verify(string method, string key, long expiresUnix, string? fileName, string signature);
}
