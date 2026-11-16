using System.Text.RegularExpressions;

namespace CongCuFile.Application.Storage;

// Quy tắc đặt khoá file trong kho. Chỉ chấp nhận khoá do chính API tạo:
// thư mục cố định + Guid + đuôi file ngắn. Không có "..", không có "\".
public static partial class FileKeys
{
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

    public static string WebInput(Guid jobId, string ext) => $"web/{jobId}-input{ext}";
    public static string Upload(Guid uploadId, string ext) => $"uploads/{uploadId}{ext}";
    public static string Result(Guid jobId, string ext) => $"results/{jobId}{ext}";
}
