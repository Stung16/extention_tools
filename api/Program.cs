using Api;
using Api.Endpoints;
using Api.Storage;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// ---------- Cấu hình ----------

// Database (SQLite, một file) và kho file (thư mục files) đều nằm trong thư mục data.
// Thư mục này đã nằm trong .gitignore nên không bị đưa lên Git.
// Chạy trong Docker thì đặt biến môi trường DataDir (ví dụ /data) để dữ liệu nằm ngoài container.
var dataDir = builder.Configuration["DataDir"] ?? Path.Combine(builder.Environment.ContentRootPath, "data");
Directory.CreateDirectory(dataDir);

builder.Services.AddDbContext<AppDb>(o =>
    o.UseSqlite($"Data Source={Path.Combine(dataDir, "jobs.db")}"));

// Mã bí mật: lúc phát triển lấy từ appsettings.Development.json; chạy thật thì đặt biến môi trường
// (WorkerKey, AdminKey, Storage__SigningKey). Thiếu thì dừng luôn, không chạy với mã rỗng.
string Required(string name) =>
    builder.Configuration[name] is { Length: > 0 } v ? v : throw new InvalidOperationException($"Chưa cấu hình {name}.");

builder.Services.AddSingleton(new Secrets(Required("WorkerKey"), Required("AdminKey")));

// Form tải lên của trang web: tối đa 100 MB (mặc định của ASP.NET chỉ khoảng 30 MB).
// File tải lên qua API v1 (ảnh RAW...): tối đa Upload:MaxBytes, mặc định 1 GB; endpoint đó tự nới giới hạn.
var limits = new UploadLimits(100L * 1024 * 1024, builder.Configuration.GetValue("Upload:MaxBytes", 1024L * 1024 * 1024));
builder.Services.AddSingleton(limits);
builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = limits.WebBytes + 1024 * 1024);
builder.Services.Configure<Microsoft.AspNetCore.Http.Features.FormOptions>(o =>
    o.MultipartBodyLengthLimit = limits.WebBytes + 1024 * 1024);

// Kho file: hiện lưu trên ổ đĩa. Bước sau thêm bản S3 (MinIO, R2) và chọn bằng cấu hình.
var localStore = new LocalFileStore(Path.Combine(dataDir, "files"), Required("Storage:SigningKey"));
builder.Services.AddSingleton(localStore);
builder.Services.AddSingleton<IFileStore>(localStore);

// Giữ job: worker gửi "tín hiệu sống" mỗi 30 giây, mỗi lần gia hạn 2 phút (đổi qua JobLeaseSeconds khi chạy thử).
builder.Services.AddSingleton(new JobRuntime(TimeSpan.FromSeconds(builder.Configuration.GetValue("JobLeaseSeconds", 120))));

var app = builder.Build();

// Tạo database và các bảng nếu chưa có. (Chưa dùng migration: đổi cấu trúc bảng khi dev thì xoá jobs.db.)
using (var scope = app.Services.CreateScope())
{
    scope.ServiceProvider.GetRequiredService<AppDb>().Database.EnsureCreated();
}

// ---------- Các cửa của API ----------

// Phục vụ các file trong thư mục wwwroot (trang web React đã build).
app.UseDefaultFiles();
app.UseStaticFiles();

app.MapWebEndpoints();     // /api/job-types, /api/jobs        trang web công cụ (không cần khoá)
app.MapWorkerEndpoints();  // /api/jobs/next, /complete...     worker (X-Worker-Key)
app.MapAdminEndpoints();   // /api/admin/...                   app giám sát (X-Admin-Key)
app.MapV1Endpoints();      // /v1/...                          app khách (Authorization: Bearer <khoá>)

// Các địa chỉ trang như /nen-pdf hay /word-sang-pdf không phải file thật:
// trả về index.html, rồi trang web React tự hiện đúng công cụ.
// Địa chỉ /api/... và /v1/... không khớp endpoint nào thì vẫn báo 404 như bình thường.
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

app.Run();
