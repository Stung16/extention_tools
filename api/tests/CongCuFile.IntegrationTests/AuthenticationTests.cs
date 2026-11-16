using System.Net;
using CongCuFile.IntegrationTests.Infrastructure;

namespace CongCuFile.IntegrationTests;

// Mỗi cửa của API chỉ mở với đúng loại mã của nó.
public sealed class AuthenticationTests
{
    [Fact]
    public async Task Admin_without_key_is_rejected_with_json_error()
    {
        using var api = new ApiFactory();
        var response = await api.Anonymous().GetAsync("/api/admin/overview");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Contains("X-Admin-Key", (await response.Json()).Error());
    }

    [Fact]
    public async Task Worker_key_does_not_open_admin_endpoints()
    {
        using var api = new ApiFactory();
        var client = api.Anonymous();
        client.DefaultRequestHeaders.Add("X-Admin-Key", ApiFactory.WorkerKey);

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/admin/overview")).StatusCode);
    }

    [Fact]
    public async Task Worker_endpoints_need_worker_key()
    {
        using var api = new ApiFactory();
        Assert.Equal(HttpStatusCode.Unauthorized, (await api.Anonymous().GetAsync("/api/jobs/next")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await api.Admin().GetAsync("/api/jobs/next")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await api.Worker().GetAsync("/api/jobs/next")).StatusCode);
    }

    [Fact]
    public async Task V1_rejects_missing_wrong_and_disabled_keys()
    {
        using var api = new ApiFactory();
        var (appId, key) = await TestApi.CreateApp(api.Admin());

        var missing = await api.Anonymous().GetAsync("/v1/job-types");
        Assert.Equal(HttpStatusCode.Unauthorized, missing.StatusCode);
        Assert.Contains("Thiếu khoá API", (await missing.Json()).Error());

        var wrong = await api.App("ccf_sai").GetAsync("/v1/job-types");
        Assert.Equal(HttpStatusCode.Unauthorized, wrong.StatusCode);
        Assert.Contains("không hợp lệ", (await wrong.Json()).Error());

        Assert.Equal(HttpStatusCode.OK, (await api.App(key).GetAsync("/v1/job-types")).StatusCode);

        await api.Admin().PostAsync($"/api/admin/clients/{appId}/disable", null);
        Assert.Equal(HttpStatusCode.Unauthorized, (await api.App(key).GetAsync("/v1/job-types")).StatusCode);
    }

    [Fact]
    public async Task Website_endpoints_are_anonymous()
    {
        using var api = new ApiFactory();
        Assert.Equal(HttpStatusCode.OK, (await api.Anonymous().GetAsync("/api/job-types")).StatusCode);
        await TestApi.CreateWebJob(api.Anonymous());
    }
}
