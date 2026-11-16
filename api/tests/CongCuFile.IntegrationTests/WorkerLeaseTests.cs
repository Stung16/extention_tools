using System.Net;
using System.Net.Http.Json;
using CongCuFile.IntegrationTests.Infrastructure;

namespace CongCuFile.IntegrationTests;

// Cơ chế giữ job: worker chết giữa chừng thì job được giao lại; lượt cũ không ghi đè lượt mới.
public sealed class WorkerLeaseTests
{
    [Fact]
    public async Task Full_cycle_web_job_to_download()
    {
        using var api = new ApiFactory();
        var jobId = await TestApi.CreateWebJob(api.Anonymous());

        var claimed = (await TestApi.Next(api.Worker()))!.Value;
        Assert.Equal(jobId, claimed.Id());
        Assert.Equal(1, claimed.GetProperty("attempt").GetInt32());
        Assert.Equal("file", claimed.GetProperty("input").GetString());

        var input = await api.Worker().GetAsync($"/api/jobs/{jobId}/input");
        Assert.Equal(TestApi.SmallPng, await input.Content.ReadAsByteArrayAsync());

        Assert.Equal(HttpStatusCode.OK, (await TestApi.Complete(api.Worker(), jobId, attempt: 1)).StatusCode);

        var status = await (await api.Anonymous().GetAsync($"/api/jobs/{jobId}")).Json();
        Assert.Equal("Done", status.GetProperty("status").GetString());
        Assert.Equal(".png", status.GetProperty("outputExt").GetString());

        var output = await api.Anonymous().GetAsync($"/api/jobs/{jobId}/output");
        Assert.Equal("image/png", output.Content.Headers.ContentType?.MediaType);
        Assert.Equal("anh-ket-qua.png", output.Content.Headers.ContentDisposition?.FileNameStar);
    }

    [Fact]
    public async Task Expired_job_is_given_out_again_and_old_attempt_is_rejected()
    {
        using var api = new ApiFactory();
        var worker = api.Worker();
        var jobId = await TestApi.CreateWebJob(api.Anonymous());

        await TestApi.Next(worker);                       // lượt 1 nhận rồi "chết"
        Assert.Null(await TestApi.Next(worker));          // còn hạn: không giao cho ai khác

        api.Clock.Advance(TimeSpan.FromMinutes(3));       // quá hạn giữ 2 phút
        var second = (await TestApi.Next(worker))!.Value;
        Assert.Equal(jobId, second.Id());
        Assert.Equal(2, second.GetProperty("attempt").GetInt32());

        Assert.Equal(HttpStatusCode.Conflict, (await TestApi.Complete(worker, jobId, attempt: 1)).StatusCode);
        var lateFail = await worker.PostAsJsonAsync($"/api/jobs/{jobId}/fail", new { error = "muộn", attempt = 1 });
        Assert.Equal(HttpStatusCode.Conflict, lateFail.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await worker.PostAsync($"/api/jobs/{jobId}/heartbeat?attempt=1", null)).StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await TestApi.Complete(worker, jobId, attempt: 2)).StatusCode);
        // Job đã xong thì báo lỗi muộn cũng không ghi đè.
        var failAfterDone = await worker.PostAsJsonAsync($"/api/jobs/{jobId}/fail", new { error = "muộn", attempt = 2 });
        Assert.Equal(HttpStatusCode.Conflict, failAfterDone.StatusCode);
    }

    [Fact]
    public async Task Heartbeat_keeps_the_job()
    {
        using var api = new ApiFactory();
        var worker = api.Worker();
        var jobId = await TestApi.CreateWebJob(api.Anonymous());
        await TestApi.Next(worker);

        // Cứ 1,5 phút gửi tín hiệu sống một lần, tổng cộng 6 phút: job vẫn thuộc lượt 1.
        for (var i = 0; i < 4; i++)
        {
            api.Clock.Advance(TimeSpan.FromSeconds(90));
            Assert.Equal(HttpStatusCode.OK, (await worker.PostAsync($"/api/jobs/{jobId}/heartbeat?attempt=1", null)).StatusCode);
        }
        Assert.Null(await TestApi.Next(worker));
    }

    [Fact]
    public async Task Job_that_kills_the_worker_three_times_fails()
    {
        using var api = new ApiFactory();
        var worker = api.Worker();
        var jobId = await TestApi.CreateWebJob(api.Anonymous());

        for (var attempt = 1; attempt <= 3; attempt++)
        {
            var claimed = (await TestApi.Next(worker))!.Value;
            Assert.Equal(attempt, claimed.GetProperty("attempt").GetInt32());
            api.Clock.Advance(TimeSpan.FromMinutes(3));
        }

        Assert.Null(await TestApi.Next(worker));
        var status = await (await api.Anonymous().GetAsync($"/api/jobs/{jobId}")).Json();
        Assert.Equal("Failed", status.GetProperty("status").GetString());
        Assert.Contains("3 lần", status.GetProperty("error").GetString());
    }
}
