using System.Text.RegularExpressions;

namespace Api.Storage;

// "Kho file": nơi lưu file đầu vào và kết quả. Code còn lại chỉ làm việc qua giao diện này,
// nên sau này đổi từ ổ đĩa sang kho kiểu S3 (MinIO, Cloudflare R2...) chỉ cần viết thêm một bản cài đặt.
//
// Khoá (key) là "đường dẫn" của file trong kho, ví dụ "uploads/<guid>.arw", "results/<guid>.tif".
public interface IFileStore
{
    Stream OpenWrite(string key);
    Stream OpenRead(string key);
    bool Exists(string key);
    long Size(string key);
    void Delete(string key);

    // Tổng dung lượng và số file đang lưu (cho app giám sát).
    (int Files, long Bytes) Usage();

    // Link có thời hạn để app khách tải file lên (PUT) hoặc tải kết quả về (GET) mà không cần khoá API.
    // Bản ổ đĩa: link trỏ về API, kèm chữ ký. Bản S3: link "presigned" trỏ thẳng vào kho.
    string UploadUrl(string baseUrl, string key, DateTime expiresUtc);
    string DownloadUrl(string baseUrl, string key, string fileName, DateTime expiresUtc);
}

public static partial class FileKeys
{
    // Chỉ cho phép khoá do chính API tạo: thư mục cố định + Guid + đuôi file ngắn. Không có "..", không có "\".
    [GeneratedRegex(@"^(web|uploads|results)/[0-9a-f\-]{36}(-input)?(\.[a-z0-9]{1,10})?$")]
    private static partial Regex KeyPattern();

    [GeneratedRegex(@"^\.[a-z0-9]{1,10}$")]
    private static partial Regex ExtPattern();

    public static bool IsValid(string key) => KeyPattern().IsMatch(key);

    public static bool IsValidExt(string ext) => ExtPattern().IsMatch(ext);

    // Đuôi file an toàn để ghép vào khoá: đuôi lạ (dấu cách, ký tự đặc biệt) thì bỏ.
    public static string SafeExt(string fileName)
    {
        var ext = Path.GetExtension(fileName).ToLowerInvariant();
        return IsValidExt(ext) ? ext : "";
    }
}
