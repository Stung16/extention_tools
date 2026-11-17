using CongCuFile.Api.Authentication;
using CongCuFile.Api.Background;
using CongCuFile.Api.Common;
using CongCuFile.Application.Common;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Server.Kestrel.Core;

namespace CongCuFile.Api;

public static class ApiLayer
{
    // Đăng ký phần web: controller, xác thực, bắt lỗi chung, giới hạn dung lượng tải lên.
    public static IServiceCollection AddApiLayer(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddControllers();
        services.AddExceptionHandler<GlobalExceptionHandler>();
        services.AddProblemDetails();

        // Thiếu WorkerKey/AdminKey thì dừng ngay lúc khởi động, không chạy với mã rỗng.
        services.AddOptions<SecurityOptions>().Bind(configuration).ValidateDataAnnotations().ValidateOnStart();

        services.AddAuthentication()
            .AddScheme<AuthenticationSchemeOptions, WorkerKeyHandler>(AuthSchemes.Worker, null)
            .AddScheme<AuthenticationSchemeOptions, AdminKeyHandler>(AuthSchemes.Admin, null)
            .AddScheme<AuthenticationSchemeOptions, ApiKeyHandler>(AuthSchemes.ApiKey, null);
        services.AddAuthorization();

        // Việc chạy nền: tự dọn file cũ.
        services.AddHostedService<FileCleanupWorker>();

        // Form tải lên của trang web: tối đa 100 MB (mặc định của ASP.NET chỉ khoảng 30 MB).
        // Riêng PUT file của API v1 tự nới giới hạn bằng đúng dung lượng đã khai (xem SignedFilesController).
        services.AddOptions<KestrelServerOptions>().Configure<UploadSettings>((kestrel, limits) =>
            kestrel.Limits.MaxRequestBodySize = limits.WebMaxBytes + 1024 * 1024);
        services.AddOptions<FormOptions>().Configure<UploadSettings>((form, limits) =>
            form.MultipartBodyLengthLimit = limits.WebMaxBytes + 1024 * 1024);

        return services;
    }

    // Các địa chỉ trang như /nen-pdf hay /word-sang-pdf không phải file thật: trả về index.html,
    // rồi trang web React tự hiện đúng công cụ. Địa chỉ /api/... và /v1/... không khớp thì vẫn 404.
    public static void MapWebsiteFallback(this WebApplication app) =>
        app.MapFallback(async context =>
        {
            if (context.Request.Path.StartsWithSegments("/api") || context.Request.Path.StartsWithSegments("/v1"))
            {
                context.Response.StatusCode = StatusCodes.Status404NotFound;
                return;
            }
            context.Response.ContentType = "text/html; charset=utf-8";
            var index = Path.Combine(app.Environment.WebRootPath ?? "wwwroot", "index.html");
            if (!File.Exists(index))
            {
                // Máy mới clone về chưa build giao diện React.
                await context.Response.WriteAsync("<meta charset=utf-8><p>Chưa build giao diện. Chạy trong thư mục <b>web</b>: " +
                                                  "<code>npm install</code> rồi <code>npm run build</code>, sau đó tải lại trang.</p>");
                return;
            }
            await context.Response.SendFileAsync(index);
        });
}
