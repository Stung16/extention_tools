using System.Text.Json;
using CongCuFile.Domain.Catalog;
using CongCuFile.Domain.Enums;

namespace CongCuFile.Domain.Entities;

// Một việc cần xử lý (một file, hoặc một đoạn chữ / một đường link).
public class Job
{
    // Dùng Guid (chuỗi ngẫu nhiên dài) thay vì số 1, 2, 3... để không ai đoán được Id của người khác.
    public Guid Id { get; set; }

    public string Type { get; set; } = "";          // loại job, ví dụ "word-to-pdf" (xem JobCatalog)
    public JobStatus Status { get; set; }
    public string OriginalName { get; set; } = "";  // tên file người dùng tải lên
    public string InputFile { get; set; } = "";     // khoá của file đầu vào trong kho file ("" nếu không có file)
    public string? OutputFile { get; set; }         // khoá của file kết quả trong kho file (có khi Done)
    public string? Error { get; set; }              // lý do lỗi (có khi Failed/Cancelled)
    public string Options { get; set; } = "{}";     // tuỳ chọn người dùng chọn, dạng JSON, ví dụ {"level":"5"}
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    // Số lần job đã được giao cho worker (lượt 1, 2, 3...). Worker gửi kèm số lượt khi báo xong/lỗi,
    // để worker của lượt cũ (bị coi là đã chết) không ghi đè kết quả của lượt mới.
    public int Attempts { get; set; }

    // Hạn giữ job: worker đang xử lý phải gia hạn (gửi "tín hiệu sống") trước hạn này.
    public DateTime? LeaseUntil { get; set; }

    // Job đến từ đâu: null = trang web công cụ; có giá trị = app khách gọi qua API v1.
    public Guid? ClientId { get; set; }
    // Job thuộc lô nào (chỉ job tạo qua API v1) và từ file tải lên nào.
    public Guid? BatchId { get; set; }
    public Guid? UploadId { get; set; }

    // Số càng lớn càng được làm trước (xem JobPolicy).
    public int Priority { get; set; }

    // Lúc các file của job (file gốc, kết quả) bị tự động xoá vì hết thời gian lưu (xem FileCleanupService).
    // Dòng job vẫn giữ lại cho lịch sử và thống kê.
    public DateTime? FilesDeletedAt { get; set; }

    public bool FilesDeleted => FilesDeletedAt is not null;

    public bool HasResult => Status == JobStatus.Done && OutputFile is not null;

    // ---------- Đọc / ghi tuỳ chọn ----------

    // hideSecrets = true: bỏ các tuỳ chọn bí mật (mật khẩu) trước khi trả ra ngoài.
    public Dictionary<string, string> ReadOptions(bool hideSecrets = false)
    {
        var options = JsonSerializer.Deserialize<Dictionary<string, string>>(Options) ?? [];
        if (hideSecrets)
        {
            foreach (var name in JobCatalog.SecretOptionNames(Type))
                options.Remove(name);
        }
        return options;
    }

    public void WriteOptions(Dictionary<string, string> options) => Options = JsonSerializer.Serialize(options);

    // Job kết thúc thì không cần mật khẩu nữa: xoá khỏi database, không để nằm lại.
    public void ForgetSecrets() => WriteOptions(ReadOptions(hideSecrets: true));

    // ---------- Chuyển trạng thái (các bước không cần câu lệnh UPDATE có điều kiện) ----------

    public void MarkDone(string outputFile, DateTime now)
    {
        Status = JobStatus.Done;
        OutputFile = outputFile;
        LeaseUntil = null;
        UpdatedAt = now;
        ForgetSecrets();
    }

    public void MarkFailed(string error, DateTime now)
    {
        Status = JobStatus.Failed;
        Error = error;
        LeaseUntil = null;
        UpdatedAt = now;
        ForgetSecrets();
    }

    // Đưa job lỗi / đã huỷ về hàng chờ, đếm lượt lại từ đầu, xếp vào cuối hàng.
    public void ResetForRetry(DateTime now)
    {
        Status = JobStatus.Pending;
        Error = null;
        Attempts = 0;
        LeaseUntil = null;
        CreatedAt = now;
        UpdatedAt = now;
    }

    public void MarkFilesDeleted(DateTime now) => FilesDeletedAt = now;

    // Tên khi tải kết quả về: tên file gốc + đuôi của kết quả. Kết quả cùng đuôi với file gốc (nén...)
    // thì thêm "-ket-qua" để người dùng không nhầm với file gốc.
    public string DownloadName()
    {
        var outExt = Path.GetExtension(OutputFile ?? "");
        var stem = Path.GetFileNameWithoutExtension(OriginalName);
        var sameExt = string.Equals(Path.GetExtension(OriginalName), outExt, StringComparison.OrdinalIgnoreCase);
        return stem + (sameExt && InputFile != "" ? "-ket-qua" : "") + outExt;
    }
}
