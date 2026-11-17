using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using CongCuFile.Application.Common;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace CongCuFile.IntegrationTests.Infrastructure;

// Đồng hồ giả: test tự "tua" thời gian (hết hạn giữ job, link hết hạn) mà không phải chờ thật.
public sealed class FakeClock : IClock
{
    public DateTime UtcNow { get; private set; } = new(2026, 11, 17, 8, 0, 0, DateTimeKind.Utc);
    public void Advance(TimeSpan by) => UtcNow = UtcNow.Add(by);
}

// Khởi động API thật trong bộ nhớ (không mở cổng mạng), với database và kho file trong thư mục tạm riêng.
// Mỗi test tạo một ApiFactory riêng để dữ liệu các test không lẫn vào nhau.
public sealed class ApiFactory : WebApplicationFactory<Program>
{
    public const string WorkerKey = "test-worker-key";
    public const string AdminKey = "test-admin-key";

    private readonly string _dataDir = Path.Combine(Path.GetTempPath(), "congcufile-tests", Guid.NewGuid().ToString("N"));

    public FakeClock Clock { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("DataDir", _dataDir);
        builder.UseSetting("WorkerKey", WorkerKey);
        builder.UseSetting("AdminKey", AdminKey);
        builder.UseSetting("Storage:SigningKey", "test-signing-key");
        builder.UseSetting("Cleanup:IntervalMinutes", "0"); // test tự gọi FileCleanupService khi cần
        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<IClock>();
            services.AddSingleton<IClock>(Clock);
        });
    }

    public HttpClient Anonymous() => CreateClient();

    public HttpClient Worker() => WithHeader("X-Worker-Key", WorkerKey);

    public HttpClient Admin() => WithHeader("X-Admin-Key", AdminKey);

    public HttpClient App(string apiKey)
    {
        var client = CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        return client;
    }

    private HttpClient WithHeader(string name, string value)
    {
        var client = CreateClient();
        client.DefaultRequestHeaders.Add(name, value);
        return client;
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        SqliteConnection.ClearAllPools(); // nhả file jobs.db để xoá được thư mục tạm
        try { Directory.Delete(_dataDir, recursive: true); } catch (IOException) { /* còn bị giữ thì để hệ điều hành dọn */ }
    }
}

// Các thao tác hay dùng trong test, viết một lần ở đây.
public static class TestApi
{
    public static readonly byte[] SmallPng = Convert.FromBase64String(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==");

    public static async Task<JsonElement> Json(this HttpResponseMessage response) =>
        await response.Content.ReadFromJsonAsync<JsonElement>();

    public static Guid Id(this JsonElement json) => json.GetProperty("id").GetGuid();

    public static string Error(this JsonElement json) => json.GetProperty("error").GetString()!;

    // Tạo job từ "trang web" (form multipart), trả về Id.
    public static async Task<Guid> CreateWebJob(HttpClient client, string type = "compress-image", string fileName = "anh.png")
    {
        using var form = new MultipartFormDataContent
        {
            { new StringContent(type), "type" },
            { new ByteArrayContent(SmallPng), "file", fileName },
        };
        var response = await client.PostAsync("/api/jobs", form);
        Assert.Equal(System.Net.HttpStatusCode.Created, response.StatusCode);
        return (await response.Json()).Id();
    }

    // Worker xin việc; null nếu không có (204).
    public static async Task<JsonElement?> Next(HttpClient worker, string types = "compress-image")
    {
        var response = await worker.GetAsync($"/api/jobs/next?types={types}");
        return response.StatusCode == System.Net.HttpStatusCode.NoContent ? null : await response.Json();
    }

    public static async Task<HttpResponseMessage> Complete(HttpClient worker, Guid jobId, int attempt, string fileName = "ket-qua.png")
    {
        using var form = new MultipartFormDataContent
        {
            { new StringContent(attempt.ToString(System.Globalization.CultureInfo.InvariantCulture)), "attempt" },
            { new ByteArrayContent(SmallPng), "file", fileName },
        };
        return await worker.PostAsync($"/api/jobs/{jobId}/complete", form);
    }

    // Tạo app khách qua cửa quản trị, trả về khoá API.
    public static async Task<(Guid Id, string Key)> CreateApp(HttpClient admin, string name = "App thử")
    {
        var json = await (await admin.PostAsJsonAsync("/api/admin/clients", new { name })).Json();
        return (json.Id(), json.GetProperty("key").GetString()!);
    }

    // Xin chỗ tải lên rồi PUT nội dung. Trả về (Id, mã HTTP của PUT, uploadUrl).
    public static async Task<(Guid Id, System.Net.HttpStatusCode PutStatus, string Url)> Upload(
        HttpClient app, HttpClient anonymous, string fileName, byte[] data, long? declaredSize = null)
    {
        var ticket = await (await app.PostAsJsonAsync("/v1/uploads", new { fileName, size = declaredSize ?? data.Length })).Json();
        var url = ticket.GetProperty("uploadUrl").GetString()!;
        var put = await anonymous.PutAsync(new Uri(url).PathAndQuery, new ByteArrayContent(data));
        return (ticket.Id(), put.StatusCode, url);
    }
}
