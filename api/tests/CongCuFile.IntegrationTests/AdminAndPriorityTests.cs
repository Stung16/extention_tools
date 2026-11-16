using System.Net;
using System.Net.Http.Json;
using CongCuFile.IntegrationTests.Infrastructure;

namespace CongCuFile.IntegrationTests;

public sealed class AdminAndPriorityTests
{
    [Fact]
    public async Task Website_job_created_after_a_batch_is_given_out_first()
    {
        using var api = new ApiFactory();
        var (_, key) = await TestApi.CreateApp(api.Admin());
        var app = api.App(key);
        var uploads = new List<Guid>();
        for (var i = 0; i < 3; i++) uploads.Add((await TestApi.Upload(app, api.Anonymous(), $"{i}.png", TestApi.SmallPng)).Id);
        await app.PostAsJsonAsync("/v1/batches", new { type = "compress-image", uploadIds = uploads });

        var webJob = await TestApi.CreateWebJob(api.Anonymous());

        Assert.Equal(webJob, (await TestApi.Next(api.Worker()))!.Value.Id());
    }

    [Fact]
    public async Task Admin_can_cancel_and_retry_and_overview_shows_sources()
    {
        using var api = new ApiFactory();
        var admin = api.Admin();
        var (_, key) = await TestApi.CreateApp(admin, "Web nhiếp ảnh");
        var app = api.App(key);
        var upload = (await TestApi.Upload(app, api.Anonymous(), "raw.png", TestApi.SmallPng)).Id;
        var batch = await (await app.PostAsJsonAsync("/v1/batches", new { type = "compress-image", uploadIds = new[] { upload } })).Json();
        var appJob = batch.GetProperty("jobs")[0].Id();
        var webJob = await TestApi.CreateWebJob(api.Anonymous());

        // Huỷ job đang chờ; huỷ lần nữa thì 409. Thử lại thì job quay về hàng chờ.
        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsync($"/api/admin/jobs/{appJob}/cancel", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await admin.PostAsync($"/api/admin/jobs/{appJob}/cancel", null)).StatusCode);

        var overview = await (await admin.GetAsync("/api/admin/overview")).Json();
        Assert.Equal(1, overview.GetProperty("totals").GetProperty("cancelled").GetInt32());
        Assert.Equal("Web nhiếp ảnh", overview.GetProperty("recent")[0].GetProperty("source").GetString());
        Assert.Equal("Trang web", overview.GetProperty("waiting")[0].GetProperty("source").GetString());

        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsync($"/api/admin/jobs/{appJob}/retry", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await admin.PostAsync($"/api/admin/jobs/{webJob}/retry", null)).StatusCode); // đang chờ: không thử lại

        var appJobStatus = await (await app.GetAsync($"/v1/jobs/{appJob}")).Json();
        Assert.Equal("Pending", appJobStatus.GetProperty("status").GetString());
    }

    [Fact]
    public async Task Client_key_is_shown_once_and_listed_without_key()
    {
        using var api = new ApiFactory();
        var admin = api.Admin();
        var (_, key) = await TestApi.CreateApp(admin, "A");
        Assert.StartsWith("ccf_", key, StringComparison.Ordinal);

        var list = await (await admin.GetAsync("/api/admin/clients")).Json();
        var item = list[0];
        Assert.Equal("A", item.GetProperty("name").GetString());
        Assert.Equal(key[..10], item.GetProperty("keyPrefix").GetString());
        Assert.False(item.TryGetProperty("key", out _));
    }
}
