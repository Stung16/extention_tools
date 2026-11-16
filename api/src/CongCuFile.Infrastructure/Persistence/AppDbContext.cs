using CongCuFile.Application.Abstractions;
using CongCuFile.Application.Common;
using CongCuFile.Domain.Entities;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace CongCuFile.Infrastructure.Persistence;

// Cầu nối giữa code C# và database (Entity Framework Core + SQLite).
// Cấu hình từng bảng (index, kiểu cột) nằm trong thư mục Configurations/.
public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options), IUnitOfWork
{
    public DbSet<Job> Jobs => Set<Job>();
    public DbSet<ApiClient> ApiClients => Set<ApiClient>();
    public DbSet<Upload> Uploads => Set<Upload>();
    public DbSet<Batch> Batches => Set<Batch>();

    protected override void OnModelCreating(ModelBuilder modelBuilder) =>
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);

    async Task IUnitOfWork.SaveChangesAsync(CancellationToken ct)
    {
        try
        {
            await SaveChangesAsync(ct);
        }
        catch (DbUpdateException e) when (e.InnerException is SqliteException { SqliteErrorCode: 19 }) // 19 = vi phạm ràng buộc
        {
            throw new UniqueConstraintException("Trùng khoá duy nhất trong database.", e);
        }
    }

    void IUnitOfWork.DiscardChanges() => ChangeTracker.Clear();
}
