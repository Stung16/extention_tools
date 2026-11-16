using CongCuFile.Api.Authentication;
using CongCuFile.Api.Common;
using CongCuFile.Application.Admin;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CongCuFile.Api.Controllers.Admin;

// Cửa quản trị cho app giám sát (monitor/). Phải gửi kèm header X-Admin-Key (khác mã của worker).

[Route("api/admin/overview")]
[Authorize(AuthenticationSchemes = AuthSchemes.Admin)]
public sealed class OverviewController(OverviewService overview) : ApiControllerBase
{
    [HttpGet]
    public Task<OverviewDto> Get(CancellationToken ct) => overview.GetAsync(ct);
}

[Route("api/admin/jobs")]
[Authorize(AuthenticationSchemes = AuthSchemes.Admin)]
public sealed class AdminJobsController(JobAdminService jobs) : ApiControllerBase
{
    // Thử lại job lỗi hoặc đã huỷ.
    [HttpPost("{id:guid}/retry")]
    public async Task<ActionResult> Retry(Guid id, CancellationToken ct) => FromResult(await jobs.RetryAsync(id, ct));

    // Huỷ job đang chờ.
    [HttpPost("{id:guid}/cancel")]
    public async Task<ActionResult> Cancel(Guid id, CancellationToken ct) => FromResult(await jobs.CancelAsync(id, ct));
}

public sealed record NewClientRequest(string? Name);

// App khách (dùng API v1).
[Route("api/admin/clients")]
[Authorize(AuthenticationSchemes = AuthSchemes.Admin)]
public sealed class ClientsController(ApiClientService clients) : ApiControllerBase
{
    // Tạo app khách mới. Khoá API chỉ trả về MỘT LẦN ở đây; mất thì tạo app/khoá mới.
    [HttpPost]
    public async Task<ActionResult> Create(NewClientRequest body, CancellationToken ct) =>
        FromResult(await clients.CreateAsync(body.Name, ct), created => Created($"/api/admin/clients/{created.Id}", created));

    [HttpGet]
    public Task<List<ClientDto>> List(CancellationToken ct) => clients.ListAsync(ct);

    // Khoá app khách: khoá API không dùng được nữa (job đã tạo vẫn chạy tiếp).
    [HttpPost("{id:guid}/disable")]
    public async Task<ActionResult> Disable(Guid id, CancellationToken ct) => FromResult(await clients.DisableAsync(id, ct));
}
