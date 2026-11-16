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

        return services;
    }

    // Tạo database và các bảng nếu chưa có.
    // Chưa dùng EF migrations: đổi cấu trúc bảng khi dev thì xoá jobs.db. Migrations làm ở bước lên production.
    public static void InitializeDatabase(this IServiceProvider services)
    {
        using var scope = services.CreateScope();
        scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.EnsureCreated();
    }
}
