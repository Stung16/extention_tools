using CongCuFile.Application.Admin;
using CongCuFile.Application.Batches;
using CongCuFile.Application.ClientJobs;
using CongCuFile.Application.Jobs;
using CongCuFile.Application.Storage;
using CongCuFile.Application.Uploads;
using CongCuFile.Application.Workers;
using Microsoft.Extensions.DependencyInjection;

namespace CongCuFile.Application;

public static class DependencyInjection
{
    // Đăng ký các service nghiệp vụ. Thêm service mới thì thêm một dòng ở đây.
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        // Singleton: trạng thái dùng chung khi API đang chạy.
        services.AddSingleton<WorkerPresence>();

        // Scoped: mỗi request một bản (dùng chung database context của request đó).
        services.AddScoped<JobTypeQueries>();
        services.AddScoped<WebJobService>();
        services.AddScoped<WorkerJobService>();
        services.AddScoped<OverviewService>();
        services.AddScoped<JobAdminService>();
        services.AddScoped<ApiClientService>();
        services.AddScoped<UploadService>();
        services.AddScoped<SignedFileService>();
        services.AddScoped<BatchService>();
        services.AddScoped<ClientJobService>();
        return services;
    }
}
