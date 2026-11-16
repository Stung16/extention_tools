using CongCuFile.Application.Abstractions;
using CongCuFile.Application.Common;
using CongCuFile.Application.Storage;
using CongCuFile.Domain.Entities;
using CongCuFile.Domain.Enums;

namespace CongCuFile.Application.Uploads;

public sealed record UploadTicketDto(Guid Id, string UploadUrl, string Method, DateTime ExpiresAt);

// Chỗ tải lên đã được xác minh, chờ nhận nội dung.
public sealed record PendingUploadDto(Guid Id, long DeclaredSize);

public sealed record UploadReceivedDto(Guid Id, long Size);

// App khách tải file lên: xin chỗ (nhận link có thời hạn), rồi PUT nội dung file lên link đó.
public sealed class UploadService(
    IUploadRepository uploads, IUnitOfWork unitOfWork, IFileStore store, ISignedLinkVerifier verifier,
    UploadSettings limits, IClock clock)
{
    private static readonly TimeSpan UploadLinkLife = TimeSpan.FromHours(2);

    public async Task<Result<UploadTicketDto>> CreateAsync(Guid clientId, string? fileName, long size, string baseUrl, CancellationToken ct)
    {
        var name = Path.GetFileName(fileName ?? "").Trim();
        if (name.Length is 0 or > 200) return Error.Validation("Tên file (fileName) phải có từ 1 tới 200 ký tự.");
        var ext = Path.GetExtension(name).ToLowerInvariant();
        if (!FileKeys.IsValidExt(ext)) return Error.Validation("Tên file phải có đuôi hợp lệ, ví dụ .arw, .jpg.");
        if (size <= 0) return Error.Validation("Thiếu dung lượng file (size, tính bằng byte).");
        if (size > limits.ApiMaxBytes) return Error.Validation($"File quá lớn: tối đa {limits.ApiMaxBytes / 1024 / 1024} MB.");

        var now = clock.UtcNow;
        var upload = new Upload
        {
            Id = Guid.NewGuid(), ClientId = clientId, FileName = name, Ext = ext, DeclaredSize = size,
            Status = UploadStatus.Waiting, CreatedAt = now,
        };
        upload.StorageKey = FileKeys.Upload(upload.Id, ext);
        uploads.Add(upload);
        await unitOfWork.SaveChangesAsync(ct);

        var expires = now.Add(UploadLinkLife);
        return new UploadTicketDto(upload.Id, store.UploadUrl(baseUrl, upload.StorageKey, expires), "PUT", expires);
    }

    // Bước 1 khi nhận PUT: kiểm tra chữ ký, chỗ tải lên, dung lượng khai báo.
    // Tầng Api dùng DeclaredSize để giới hạn thân request trước khi đọc.
    public async Task<Result<PendingUploadDto>> BeginReceiveAsync(
        string key, long expiresUnix, string? signature, long? contentLength, CancellationToken ct)
    {
        if (signature is null || !verifier.Verify("PUT", key, expiresUnix, null, signature))
            return Error.Forbidden("Link tải lên không hợp lệ hoặc đã hết hạn.");

        var upload = await uploads.FindByStorageKeyAsync(key, ct);
        if (upload is null) return Error.NotFound("Không tìm thấy chỗ tải lên.");
        if (upload.Status == UploadStatus.Uploaded) return Error.Conflict("File này đã được tải lên rồi.");
        if (contentLength is long length && length != upload.DeclaredSize)
            return Error.Validation($"Dung lượng gửi lên ({length} byte) khác dung lượng đã khai ({upload.DeclaredSize} byte).");

        return new PendingUploadDto(upload.Id, upload.DeclaredSize);
    }

    // Bước 2: ghi thẳng thân request xuống kho theo luồng (file vài trăm MB cũng không chiếm bộ nhớ),
    // rồi kiểm tra đúng dung lượng đã khai. Hỏng giữa chừng thì xoá phần đã ghi.
    public async Task<Result<UploadReceivedDto>> ReceiveAsync(string key, Stream body, CancellationToken ct)
    {
        var upload = await uploads.FindByStorageKeyAsync(key, ct);
        if (upload is null) return Error.NotFound("Không tìm thấy chỗ tải lên.");

        try
        {
            await using var output = store.OpenWrite(key);
            await body.CopyToAsync(output, ct);
        }
        // Vượt dung lượng cho phép thì ASP.NET ném BadHttpRequestException, kiểu này cũng là IOException.
        catch (Exception e) when (e is IOException or OperationCanceledException)
        {
            store.Delete(key);
            return Error.Validation("Tải lên bị gián đoạn hoặc vượt dung lượng đã khai. Hãy tải lại.");
        }

        var size = store.Size(key);
        if (size != upload.DeclaredSize)
        {
            store.Delete(key);
            return Error.Validation($"Nhận được {size} byte, khác dung lượng đã khai ({upload.DeclaredSize} byte). Hãy tải lại.");
        }

        upload.MarkUploaded(size);
        await unitOfWork.SaveChangesAsync(ct);
        return new UploadReceivedDto(upload.Id, size);
    }
}
