using CongCuFile.Api;
using CongCuFile.Application;
using CongCuFile.Infrastructure;

// Điểm khởi động của API. Mỗi tầng tự đăng ký phần của mình:
//   AddApplication     nghiệp vụ (src/CongCuFile.Application)
//   AddInfrastructure  database, kho file, cấu hình (src/CongCuFile.Infrastructure)
//   AddApiLayer        controller, xác thực, bắt lỗi (thư mục này)
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddApplication();
builder.Services.AddInfrastructure(builder.Configuration, builder.Environment);
builder.Services.AddApiLayer(builder.Configuration);

var app = builder.Build();

app.Services.InitializeDatabase();

app.UseExceptionHandler();
app.UseDefaultFiles();   // trang web React đã build (wwwroot)
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapWebsiteFallback();

app.Run();

// Để project test (CongCuFile.IntegrationTests) khởi động được API.
public partial class Program;
