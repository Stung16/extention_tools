using System.Net;
using System.Net.Http.Json;
using CongCuFile.IntegrationTests.Infrastructure;

namespace CongCuFile.IntegrationTests;

// API v1 cho app khách: tải lên, lô, kết quả.
public sealed class ClientApiTests
{
    [Fact]
    public async Task Upload_checks_size_and_signature()
    {
        using var api = new ApiFactory();
        var (_, key) = await TestApi.CreateApp(api.Admin());
        var app = api.App(key);
        var anonymous = api.Anonymous();

        var wrongSize = await TestApi.Upload(app, anonymous, "a.png", TestApi.SmallPng, declaredSize: TestApi.SmallPng.Length + 10);
        Assert.Equal(HttpStatusCode.BadRequest, wrongSize.PutStatus);

        var ok = await TestApi.Upload(app, anonymous, "b.png", TestApi.SmallPng);
        Assert.Equal(HttpStatusCode.OK, ok.PutStatus);

        var path = new Uri(ok.Url).PathAndQuery;
        Assert.Equal(HttpStatusCode.Conflict, (await anonymous.PutAsync(path, new ByteArrayContent(TestApi.SmallPng))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await anonymous.PutAsync(path.Replace("exp=", "exp=9", StringComparison.Ordinal), new ByteArrayContent(TestApi.SmallPng))).StatusCode);
    }

    [Fact]
    public async Task Batch_flow_with_idempotency_cancel_and_result_link()
    {
        using var api = new ApiFactory();
        var (_, key) = await TestApi.CreateApp(api.Admin());
        var app = api.App(key);
        var anonymous = api.Anonymous();
        var ids = new List<Guid>();
        for (var i = 1; i <= 3; i++) ids.Add((await TestApi.Upload(app, anonymous, $"anh-{i}.png", TestApi.SmallPng)).Id);

        // Tuỳ chọn sai và file sai đuôi bị từ chối.
        var badOption = await app.PostAsJsonAsync("/v1/batches", new { type = "compress-image", uploadIds = ids, options = new { level = "khong-co" } });
        Assert.Equal(HttpStatusCode.BadRequest, badOption.StatusCode);
        var txt = (await TestApi.Upload(app, anonymous, "ghi-chu.txt", [1, 2, 3])).Id;
        Assert.Equal(HttpStatusCode.BadRequest,
            (await app.PostAsJsonAsync("/v1/batches", new { type = "compress-image", uploadIds = new[] { txt } })).StatusCode);

        // Gửi lại cùng Idempotency-Key ra đúng lô cũ.
        using var first = new HttpRequestMessage(HttpMethod.Post, "/v1/batches")
        { Content = JsonContent.Create(new { type = "compress-image", uploadIds = ids, externalId = "don-1" }) };
        first.Headers.Add("Idempotency-Key", "lo-1");
        var created = await app.SendAsync(first);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var batch = await created.Json();

        using var again = new HttpRequestMessage(HttpMethod.Post, "/v1/batches")
        { Content = JsonContent.Create(new { type = "compress-image", uploadIds = ids }) };
        again.Headers.Add("Idempotency-Key", "lo-1");
        var repeated = await app.SendAsync(again);
        Assert.Equal(HttpStatusCode.OK, repeated.StatusCode);
        Assert.Equal(batch.Id(), (await repeated.Json()).Id());

        var jobIds = batch.GetProperty("jobs").EnumerateArray().Select(j => j.Id()).ToList();
        Assert.Equal(ids, batch.GetProperty("jobs").EnumerateArray().Select(j => j.GetProperty("uploadId").GetGuid()));

        // Worker làm job đầu tiên; huỷ phần còn lại của lô.
        var worker = api.Worker();
        var claimed = (await TestApi.Next(worker))!.Value;
        Assert.Equal(jobIds[0], claimed.Id());
        await TestApi.Complete(worker, jobIds[0], attempt: 1);

        var cancel = await (await app.PostAsync($"/v1/batches/{batch.Id()}/cancel", null)).Json();
        Assert.Equal(2, cancel.GetProperty("cancelled").GetInt32());
        var counts = cancel.GetProperty("batch").GetProperty("counts");
        Assert.Equal(1, counts.GetProperty("done").GetInt32());
        Assert.Equal(2, counts.GetProperty("cancelled").GetInt32());
        Assert.True(cancel.GetProperty("batch").GetProperty("finished").GetBoolean());

        // Link kết quả tải được; sửa tên trong link hoặc quá hạn thì bị từ chối.
        var link = await (await app.GetAsync($"/v1/jobs/{jobIds[0]}/result")).Json();
        var url = new Uri(link.GetProperty("url").GetString()!).PathAndQuery;
        var download = await anonymous.GetAsync(url);
        Assert.Equal(HttpStatusCode.OK, download.StatusCode);
        Assert.Equal(link.GetProperty("size").GetInt64(), (await download.Content.ReadAsByteArrayAsync()).Length);
        Assert.Equal(HttpStatusCode.Forbidden, (await anonymous.GetAsync(url.Replace("name=", "name=khac-", StringComparison.Ordinal))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await anonymous.PutAsync(url, new ByteArrayContent([1]))).StatusCode);

        api.Clock.Advance(TimeSpan.FromHours(7));
        Assert.Equal(HttpStatusCode.Forbidden, (await anonymous.GetAsync(url)).StatusCode);
    }

    [Fact]
    public async Task Apps_only_see_their_own_data()
    {
        using var api = new ApiFactory();
        var (_, keyA) = await TestApi.CreateApp(api.Admin(), "A");
        var (_, keyB) = await TestApi.CreateApp(api.Admin(), "B");
        var appA = api.App(keyA);
        var appB = api.App(keyB);

        var upload = (await TestApi.Upload(appA, api.Anonymous(), "a.png", TestApi.SmallPng)).Id;
        var batch = await (await appA.PostAsJsonAsync("/v1/batches", new { type = "compress-image", uploadIds = new[] { upload } })).Json();
        var jobId = batch.GetProperty("jobs")[0].Id();

        Assert.Equal(HttpStatusCode.NotFound, (await appB.GetAsync($"/v1/batches/{batch.Id()}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await appB.GetAsync($"/v1/jobs/{jobId}")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await appB.PostAsJsonAsync("/v1/batches", new { type = "compress-image", uploadIds = new[] { upload } })).StatusCode);
    }
}
