using CongCuFile.Application.Abstractions;
using CongCuFile.Application.Common;

namespace CongCuFile.Application.Storage;

// Tải file qua link có chữ ký (link kết quả do GET /v1/jobs/{id}/result cấp). Chỉ dùng với kho ổ đĩa.
public sealed class SignedFileService(IFileStore store, ISignedLinkVerifier verifier)
{
    public Result<FileDownload> Open(string key, long expiresUnix, string? fileName, string? signature)
    {
        if (signature is null || !verifier.Verify("GET", key, expiresUnix, fileName, signature))
            return Error.Forbidden("Link tải về không hợp lệ hoặc đã hết hạn.");
        if (!store.Exists(key)) return Error.NotFound("File không còn trên máy chủ.");
        return new FileDownload(store.OpenRead(key), string.IsNullOrEmpty(fileName) ? Path.GetFileName(key) : fileName);
    }
}
