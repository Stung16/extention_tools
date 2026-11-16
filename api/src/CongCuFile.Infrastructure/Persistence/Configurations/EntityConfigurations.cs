using CongCuFile.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CongCuFile.Infrastructure.Persistence.Configurations;

// Cấu hình bảng trong database. Trạng thái lưu dạng chữ ("Pending") thay vì số (0) để mở database ra đọc cho dễ.

internal sealed class JobConfiguration : IEntityTypeConfiguration<Job>
{
    public void Configure(EntityTypeBuilder<Job> b)
    {
        b.Property(j => j.Status).HasConversion<string>();
        b.Ignore(j => j.HasResult);
        // Worker hỏi việc: lọc theo trạng thái, xếp theo ưu tiên rồi thời gian tạo.
        b.HasIndex(j => new { j.Status, j.Priority, j.CreatedAt });
        b.HasIndex(j => j.BatchId);
    }
}

internal sealed class ApiClientConfiguration : IEntityTypeConfiguration<ApiClient>
{
    public void Configure(EntityTypeBuilder<ApiClient> b) => b.HasIndex(c => c.KeyHash).IsUnique();
}

internal sealed class UploadConfiguration : IEntityTypeConfiguration<Upload>
{
    public void Configure(EntityTypeBuilder<Upload> b)
    {
        b.Property(u => u.Status).HasConversion<string>();
        b.HasIndex(u => u.StorageKey).IsUnique();
    }
}

internal sealed class BatchConfiguration : IEntityTypeConfiguration<Batch>
{
    // Mỗi app khách chỉ có một lô cho mỗi Idempotency-Key (NULL thì không tính).
    public void Configure(EntityTypeBuilder<Batch> b) => b.HasIndex(x => new { x.ClientId, x.IdempotencyKey }).IsUnique();
}
