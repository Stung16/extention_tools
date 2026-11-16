using System.Security.Cryptography;
using System.Text;

namespace CongCuFile.Application.Security;

// Khoá API của app khách và so sánh mã bí mật.
public static class ApiKeyHasher
{
    private const string Prefix = "ccf_";

    // "ccf_" + 32 byte ngẫu nhiên (base64url): đủ dài để không ai đoán được.
    public static string Generate() =>
        Prefix + Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    // Database chỉ lưu mã băm SHA-256 của khoá.
    public static string Hash(string key) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(key)));

    // So sánh trong thời gian không đổi: không để lộ mã qua thời gian phản hồi.
    public static bool SameSecret(string? given, string expected) =>
        CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(given ?? ""), Encoding.UTF8.GetBytes(expected));
}
