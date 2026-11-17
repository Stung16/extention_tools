using System.ComponentModel.DataAnnotations;
using CongCuFile.Application.Abstractions;
using CongCuFile.Application.Common;
using CongCuFile.Infrastructure.Persistence;
using CongCuFile.Infrastructure.Persistence.Repositories;
using CongCuFile.Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace CongCuFile.Infrastructure;

// Cấu hình kho file (mục "Storage" trong appsettings, hoặc biến môi trường Storage__SigningKey).
public sealed class StorageOptions
{
    [Required(ErrorMessage = "Chưa cấu hình Storage:SigningKey.")]
    public string SigningKey { get; set; } = "";
}

internal sealed class SystemClock : IClock
{
    public DateTime UtcNow => DateTime.UtcNow;
}

public static class DependencyInjection
{
    private const long WebMaxBytes = 100L * 1024 * 1024;        // form tải lên của trang web
    private const long DefaultApiMaxBytes = 1024L * 1024 * 1024; // file tải lên qua API v1 (Upload:MaxBytes)

    // Đăng ký database, kho file, cấu hình.
    // Database (SQLite) và kho file nằm trong thư mục DataDir (mặc định: thư mục "data" cạnh project Api;
    // Docker đặt DataDir=/data). Thư mục data đã nằm trong .gitignore.
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration, IHostEnvironment environment)
    {
        var dataDir = configuration["DataDir"] ?? Path.Combine(environment.ContentRootPath, "data");
        Directory.CreateDirectory(dataDir);

        services.AddDbContext<AppDbContext>(o => o.UseSqlite($"Data Source={Path.Combine(dataDir, "jobs.db")}"));
        services.AddScoped<IUnitOfWork>(sp => sp.GetRequiredService<AppDbContext>());
        services.AddScoped<IJobRepository, JobRepository>();
        services.AddScoped<IBatchRepository, BatchRepository>();
        services.AddScoped<IUploadRepository, UploadRepository>();
        services.AddScoped<IApiClientRepository, ApiClientRepository>();

        services.AddSingleton<IClock, SystemClock>();

        // Thiếu khoá ký thì dừng ngay lúc khởi động, không chạy với khoá rỗng.
        services.AddOptions<StorageOptions>().Bind(configuration.GetSection("Storage")).ValidateDataAnnotations().ValidateOnStart();

        // Kho file: hiện lưu trên ổ đĩa. Sau này thêm bản S3 (MinIO, R2) và chọn bằng cấu hình ở đây.
        services.AddSingleton(sp => new LocalFileStore(
            Path.Combine(dataDir, "files"),
            sp.GetRequiredService<IOptions<StorageOptions>>().Value.SigningKey,
            sp.GetRequiredService<IClock>()));
        services.AddSingleton<IFileStore>(sp => sp.GetRequiredService<LocalFileStore>());
        services.AddSingleton<ISignedLinkVerifier>(sp => sp.GetRequiredService<LocalFileStore>());

        // Giữ job 2 phút mỗi lần gia hạn (JobLeaseSeconds: đổi khi chạy thử). Giới hạn dung lượng tải lên.
        services.AddSingleton(new JobLeaseSettings(TimeSpan.FromSeconds(configuration.GetValue("JobLeaseSeconds", 120))));
        services.AddSingleton(new UploadSettings(WebMaxBytes, configuration.GetValue("Upload:MaxBytes", DefaultApiMaxBytes)));

        // Tự xoá file sau: 2 giờ với job trang web, 24 giờ với app khách (Cleanup:WebFileHours, Cleanup:ClientFileHours).
        services.AddSingleton(new RetentionSettings(
            TimeSpan.FromHours(PositiveHours(configuration, "Cleanup:WebFileHours", 2)),
            TimeSpan.FromHours(PositiveHours(configuration, "Cleanup:ClientFileHours", 24))));

        return services;
    }

    private static double PositiveHours(IConfiguration configuration, string key, double fallback)
    {
        var hours = configuration.GetValue(key, fallback);
        return hours > 0 ? hours : throw new InvalidOperationException($"{key} phải lớn hơn 0 (đang là {hours}).");
    }

    // Tạo database và các bảng nếu chưa có.
    // Chưa dùng EF migrations: đổi cấu trúc bảng khi dev thì xoá jobs.db. Migrations làm ở bước lên production.
    public static void InitializeDatabase(this IServiceProvider services)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.Database.EnsureCreated();

        // EnsureCreated không thêm cột vào bảng đã có. Tạm thời (tới khi dùng migrations) tự thêm các cột mới
        // ở đây, để database đang chạy không phải xoá. Thêm cột mới vào thực thể thì thêm một dòng.
        AddColumnIfMissing(db, "Jobs", "FilesDeletedAt", "TEXT NULL");
    }

    private static void AddColumnIfMissing(AppDbContext db, string table, string column, string definition)
    {
        // Tên bảng/cột là hằng số trong code; vẫn chặn ký tự lạ vì câu ALTER không dùng tham số cho tên được.
        if (!table.All(char.IsAsciiLetterOrDigit) || !column.All(char.IsAsciiLetterOrDigit))
            throw new ArgumentException("Tên bảng/cột chỉ được gồm chữ và số.");

        var exists = db.Database
            .SqlQuery<int>($"SELECT COUNT(*) AS Value FROM pragma_table_info({table}) WHERE name = {column}")
            .AsEnumerable()
            .First() > 0;
        if (exists) return;
#pragma warning disable EF1003 // tên bảng/cột đã kiểm tra chỉ gồm chữ và số ở trên, definition là hằng số trong code
        db.Database.ExecuteSqlRaw("ALTER TABLE \"" + table + "\" ADD COLUMN \"" + column + "\" " + definition);
#pragma warning restore EF1003
    }
}
