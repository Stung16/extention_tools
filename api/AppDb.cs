using Microsoft.EntityFrameworkCore;

namespace Api;

// Cầu nối giữa code C# và database (Entity Framework Core).
public class AppDb(DbContextOptions<AppDb> options) : DbContext(options)
{
    public DbSet<Job> Jobs => Set<Job>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        // Lưu trạng thái dạng chữ ("Pending") thay vì số (0) để mở database ra đọc cho dễ.
        b.Entity<Job>().Property(j => j.Status).HasConversion<string>();
        b.Entity<Job>().HasIndex(j => new { j.Status, j.CreatedAt });
    }
}
