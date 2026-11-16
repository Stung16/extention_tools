using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.WebUtilities;

namespace Api.Storage;

// Kho file trên ổ đĩa (dùng khi chạy thử và khi chưa có kho S3).
// Link tải lên/tải về trỏ về endpoint /v1/files/... của API, kèm thời hạn và chữ ký HMAC:
// ai sửa khoá, thời hạn hay tên file trong link thì chữ ký không khớp nữa.
public class LocalFileStore(string root, string signingKey) : IFileStore
{
    readonly byte[] secret = Encoding.UTF8.GetBytes(signingKey);

    string PathOf(string key)
    {
        if (!FileKeys.IsValid(key)) throw new ArgumentException($"Khoá file không hợp lệ: {key}");
        return Path.Combine(root, key.Replace('/', Path.DirectorySeparatorChar));
    }

    public Stream OpenWrite(string key)
    {
        var path = PathOf(key);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        return File.Create(path);
    }

    public Stream OpenRead(string key) => File.OpenRead(PathOf(key));

    public bool Exists(string key) => FileKeys.IsValid(key) && File.Exists(PathOf(key));

    public long Size(string key) => Exists(key) ? new FileInfo(PathOf(key)).Length : 0;

    public void Delete(string key)
    {
        if (Exists(key)) File.Delete(PathOf(key));
    }

    public (int Files, long Bytes) Usage()
    {
        if (!Directory.Exists(root)) return (0, 0);
        var sizes = Directory.EnumerateFiles(root, "*", SearchOption.AllDirectories).Select(f => new FileInfo(f).Length).ToList();
        return (sizes.Count, sizes.Sum());
    }

    public string UploadUrl(string baseUrl, string key, DateTime expiresUtc)
    {
        var exp = new DateTimeOffset(expiresUtc).ToUnixTimeSeconds();
        return $"{baseUrl}/v1/files/{key}?exp={exp}&sig={Sign("PUT", key, exp, null)}";
    }

    public string DownloadUrl(string baseUrl, string key, string fileName, DateTime expiresUtc)
    {
        var exp = new DateTimeOffset(expiresUtc).ToUnixTimeSeconds();
        return $"{baseUrl}/v1/files/{key}?exp={exp}&name={Uri.EscapeDataString(fileName)}&sig={Sign("GET", key, exp, fileName)}";
    }

    // Kiểm tra link do chính kho này cấp: đúng phương thức (link tải về không dùng để tải lên được),
    // đúng khoá, đúng tên file, chưa hết hạn.
    public bool Verify(string method, string key, long exp, string? fileName, string sig)
    {
        if (!FileKeys.IsValid(key) || DateTimeOffset.UtcNow.ToUnixTimeSeconds() > exp) return false;
        var expected = Encoding.ASCII.GetBytes(Sign(method, key, exp, fileName));
        return CryptographicOperations.FixedTimeEquals(expected, Encoding.ASCII.GetBytes(sig));
    }

    string Sign(string method, string key, long exp, string? fileName) =>
        WebEncoders.Base64UrlEncode(HMACSHA256.HashData(secret, Encoding.UTF8.GetBytes($"{method}\n{key}\n{exp}\n{fileName}")));
}
