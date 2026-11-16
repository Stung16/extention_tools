using CongCuFile.Api.Authentication;
using CongCuFile.Api.Common;
using CongCuFile.Application.Common;
using CongCuFile.Application.Workers;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CongCuFile.Api.Controllers.Workers;

public sealed record FailRequest(string Error, int Attempt);

// Cửa cho worker (máy xử lý). Phải gửi kèm header X-Worker-Key.
[Route("api/jobs")]
[Authorize(AuthenticationSchemes = AuthSchemes.Worker)]
public sealed class WorkerJobsController(WorkerJobService worker) : ApiControllerBase
{
    // Worker hỏi: "có job nào không?" kèm các loại job nó làm được (?types=a,b,c).
    // 204 = không có. 200 = có, job đã chuyển sang Processing và được giữ cho worker này.
    [HttpGet("next")]
    public async Task<ActionResult> Next([FromQuery] string? types, CancellationToken ct)
    {
        var wanted = (types ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var job = await worker.ClaimNextAsync(wanted, ct);
        return job is null ? NoContent() : Ok(job);
    }

    // "Tôi vẫn đang làm job này" (?attempt=số lượt). 409 = job không còn thuộc lượt này: worker nên bỏ.
    [HttpPost("{id:guid}/heartbeat")]
    public async Task<ActionResult> Heartbeat(Guid id, [FromQuery] int attempt, CancellationToken ct) =>
        FromResult(await worker.HeartbeatAsync(id, attempt, ct));

    [HttpGet("{id:guid}/input")]
    public async Task<ActionResult> Input(Guid id, CancellationToken ct) =>
        FromResult(await worker.OpenInputAsync(id, ct), file => SendFile(file, "application/octet-stream"));

    // Báo xong: form gồm "file" (kết quả), "attempt" (số lượt), "name" (tên kết quả, cho job dạng đường link).
    [HttpPost("{id:guid}/complete")]
    public async Task<ActionResult> Complete(Guid id, CancellationToken ct)
    {
        var form = await Request.ReadFormAsync(ct);
        int? attempt = int.TryParse(form["attempt"], out var a) ? a : null;
        var upload = form.Files["file"];

        await using var content = upload?.OpenReadStream();
        var file = upload is null ? null : new IncomingFile(upload.FileName, upload.Length, content!);

        return FromResult(await worker.CompleteAsync(id, attempt, file, form["name"].ToString(), ct));
    }

    // Báo lỗi: JSON {"error": "...", "attempt": số lượt}.
    [HttpPost("{id:guid}/fail")]
    public async Task<ActionResult> Fail(Guid id, FailRequest body, CancellationToken ct) =>
        FromResult(await worker.FailAsync(id, body.Error, body.Attempt, ct));
}
