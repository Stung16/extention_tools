using System.Net;
using System.Net.Http.Json;
using CongCuFile.Application.Abstractions;
using CongCuFile.Application.Maintenance;
using CongCuFile.IntegrationTests.Infrastructure;
using Microsoft.Extensions.DependencyInjection;

namespace CongCuFile.IntegrationTests;

// Tự xoá file cũ: job trang web sau 2 giờ, app khách sau 24 giờ; job chưa xong và file còn dùng thì không xoá.
public sealed class CleanupTests
{
    private static async Task<CleanupReport> Cleanup(ApiFactory api)
    {
        using var scope = api.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<FileCleanupService>().RunOnceAsync(CancellationToken.None);
    }

    private static int StoredFiles(ApiFactory api) => api.Services.GetRequiredService<IFileStore>().Usage().Files;

    [Fact]
    public async Task Web_job_files_are_deleted_two_hours_after_it_finished()
    {
        using var api = new ApiFactory();
        var web = api.Anonymous();
        var worker = api.Worker();
        var id = await TestApi.CreateWebJob(web);
        var job = await TestApi.Next(worker);
        Assert.Equal(HttpStatusCode.OK, (await TestApi.Complete(worker, id, job!.Value.GetProperty("attempt").GetInt32())).StatusCode);
        Assert.Equal(2, StoredFiles(api)); // file gốc + kết quả

        api.Clock.Advance(TimeSpan.FromMinutes(119));
        Assert.Equal(0, (await Cleanup(api)).Files);
        Assert.Equal(HttpStatusCode.OK, (await web.GetAsync($"/api/jobs/{id}/output")).StatusCode);

        api.Clock.Advance(TimeSpan.FromMinutes(2));
        var report = await Cleanup(api);
        Assert.Equal((1, 2), (report.Jobs, report.Files));
        Assert.Equal(0, StoredFiles(api));

        var output = await web.GetAsync($"/api/jobs/{id}/output");
        Assert.Equal(HttpStatusCode.Gone, output.StatusCode);
        Assert.Contains("tự động xoá", (await output.Json()).Error(), StringComparison.Ordinal);
        Assert.Equal("Done", (await (await web.GetAsync($"/api/jobs/{id}")).Json()).GetProperty("status").GetString());

        Assert.Equal(0, (await Cleanup(api)).Jobs); // lần sau không đụng lại job đã dọn
    }

    [Fact]
    public async Task Waiting_job_keeps_its_file_and_failed_job_cannot_be_retried_after_cleanup()
    {
        using var api = new ApiFactory();
        var web = api.Anonymous();
        var worker = api.Worker();
        var failed = await TestApi.CreateWebJob(web);
        var job = await TestApi.Next(worker);
        await worker.PostAsJsonAsync($"/api/jobs/{failed}/fail", new { error = "lỗi thử", attempt = job!.Value.GetProperty("attempt").GetInt32() });
        var waiting = await TestApi.CreateWebJob(web);

        api.Clock.Advance(TimeSpan.FromHours(3));
        Assert.Equal(1, (await Cleanup(api)).Jobs); // chỉ job lỗi bị dọn
        Assert.Equal(1, StoredFiles(api)); // file của job đang chờ vẫn còn

        // Job đang chờ (dù đã 3 giờ) vẫn được làm bình thường.
        var next = await TestApi.Next(worker);
        Assert.Equal(waiting, next!.Value.Id());
        Assert.Equal(HttpStatusCode.OK, (await worker.GetAsync($"/api/jobs/{waiting}/input")).StatusCode);

        var retry = await api.Admin().PostAsync($"/api/admin/jobs/{failed}/retry", null);
        Assert.Equal(HttpStatusCode.Conflict, retry.StatusCode);
        Assert.Contains("tự động xoá", (await retry.Json()).Error(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Client_results_last_a_day_and_uploads_stay_while_a_job_needs_them()
    {
        using var api = new ApiFactory();
        var (_, key) = await TestApi.CreateApp(api.Admin());
        var app = api.App(key);
        var worker = api.Worker();
        var upload = (await TestApi.Upload(app, api.Anonymous(), "anh.png", TestApi.SmallPng)).Id;
        var first = await (await app.PostAsJsonAsync("/v1/batches", new { type = "compress-image", uploadIds = new[] { upload } })).Json();
        var second = await (await app.PostAsJsonAsync("/v1/batches", new { type = "compress-image", uploadIds = new[] { upload } })).Json();

        // Một lô xong, lô kia còn chờ (hai lô cùng dùng một file tải lên).
        var job = await TestApi.Next(worker);
        await TestApi.Complete(worker, job!.Value.Id(), job.Value.GetProperty("attempt").GetInt32());
        var doneJobId = job.Value.Id();

        api.Clock.Advance(TimeSpan.FromHours(3));
        Assert.Equal(0, (await Cleanup(api)).Files); // 3 giờ: app khách vẫn còn giữ
        Assert.Equal(HttpStatusCode.OK, (await app.GetAsync($"/v1/jobs/{doneJobId}/result")).StatusCode);

        api.Clock.Advance(TimeSpan.FromHours(22));
        var report = await Cleanup(api);
        Assert.Equal((1, 0), (report.Jobs, report.Uploads)); // kết quả bị xoá; file tải lên còn job lô 2 cần
        Assert.Equal(HttpStatusCode.Gone, (await app.GetAsync($"/v1/jobs/{doneJobId}/result")).StatusCode);

        // Huỷ lô còn chờ (gọi cho cả hai lô; lô đã xong thì không có gì để huỷ):
        // không còn job nào cần file tải lên nữa -> lượt dọn sau xoá nó.
        await app.PostAsync($"/v1/batches/{first.Id()}/cancel", null);
        await app.PostAsync($"/v1/batches/{second.Id()}/cancel", null);
        report = await Cleanup(api);
        Assert.Equal(1, report.Uploads);
        Assert.Equal(0, StoredFiles(api));

        var reuse = await app.PostAsJsonAsync("/v1/batches", new { type = "compress-image", uploadIds = new[] { upload } });
        Assert.Equal(HttpStatusCode.BadRequest, reuse.StatusCode);
        Assert.Contains("tải lên lại", (await reuse.Json()).Error(), StringComparison.Ordinal);
    }
}
