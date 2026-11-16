using Microsoft.EntityFrameworkCore;

namespace Api;

// Cầu nối giữa code C# và database (Entity Framework Core).
public class AppDb(DbContextOptions<AppDb> options) : DbContext(options)
{
    public DbSet<Job> Jobs => Set<Job>();
    public DbSet<ApiClient> ApiClients => Set<ApiClient>();
    public DbSet<Upload> Uploads => Set<Upload>();
    public DbSet<Batch> Batches => Set<Batch>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        // Lưu trạng thái dạng chữ ("Pending") thay vì số (0) để mở database ra đọc cho dễ.
        b.Entity<Job>().Property(j => j.Status).HasConversion<string>();
        // Worker hỏi việc: lọc theo trạng thái, xếp theo ưu tiên rồi thời gian tạo.
        b.Entity<Job>().HasIndex(j => new { j.Status, j.Priority, j.CreatedAt });
        b.Entity<Job>().HasIndex(j => j.BatchId);

        b.Entity<ApiClient>().HasIndex(c => c.KeyHash).IsUnique();

        b.Entity<Upload>().Property(u => u.Status).HasConversion<string>();
        b.Entity<Upload>().HasIndex(u => u.StorageKey).IsUnique();

        // Mỗi app khách chỉ có một lô cho mỗi Idempotency-Key (NULL thì không tính).
        b.Entity<Batch>().HasIndex(x => new { x.ClientId, x.IdempotencyKey }).IsUnique();
    }
}
