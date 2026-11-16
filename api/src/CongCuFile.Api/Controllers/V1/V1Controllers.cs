using System.Text.Json;
using CongCuFile.Api.Authentication;
using CongCuFile.Api.Common;
using CongCuFile.Application.Batches;
using CongCuFile.Application.ClientJobs;
using CongCuFile.Application.Jobs;
using CongCuFile.Application.Uploads;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CongCuFile.Api.Controllers.V1;

// API v1 cho app khách (ví dụ web nhiếp ảnh gia). Header: Authorization: Bearer <khoá API>.
// Mỗi app chỉ thấy file, lô, job của chính nó.
//
// Luồng: POST /v1/uploads (xin chỗ) -> PUT file lên uploadUrl -> POST /v1/batches (tạo lô)
//        -> GET /v1/batches/{id} (theo dõi) -> GET /v1/jobs/{id}/result (lấy link tải kết quả).

[Route("v1/job-types")]
[Authorize(AuthenticationSchemes = AuthSchemes.ApiKey)]
public sealed class ClientJobTypesController : ApiControllerBase
{
    [HttpGet]
    public IEnumerable<ClientJobTypeDto> Get() => JobTypeQueries.ForClients();
}

public sealed record CreateUploadRequest(string? FileName, long Size);

[Route("v1/uploads")]
[Authorize(AuthenticationSchemes = AuthSchemes.ApiKey)]
public sealed class UploadsController(UploadService uploads) : ApiControllerBase
{
    // Xin chỗ tải lên: nhận uploadUrl (có thời hạn), rồi PUT nội dung file thô lên đó.
    [HttpPost]
    public async Task<ActionResult> Create(CreateUploadRequest body, CancellationToken ct) =>
        FromResult(await uploads.CreateAsync(User.GetClientId(), body.FileName, body.Size, BaseUrl, ct),
            ticket => Created($"/v1/uploads/{ticket.Id}", ticket));
}

// Options: giá trị có thể là chuỗi, số hoặc true/false trong JSON.
public sealed record CreateBatchBody(string? Type, Dictionary<string, JsonElement>? Options, Guid[]? UploadIds, string? ExternalId);

[Route("v1/batches")]
[Authorize(AuthenticationSchemes = AuthSchemes.ApiKey)]
public sealed class BatchesController(BatchService batches) : ApiControllerBase
{
    // Tạo lô. Gửi lại cùng header Idempotency-Key thì trả lô cũ (200) thay vì tạo thêm (201).
    [HttpPost]
    public async Task<ActionResult> Create(
        CreateBatchBody body, [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey, CancellationToken ct)
    {
        var options = (body.Options ?? []).ToDictionary(o => o.Key, o => JsonText(o.Value));
        var request = new CreateBatchRequest(body.Type, options, body.UploadIds ?? [], body.ExternalId);
        var result = await batches.CreateAsync(User.GetClientId(), request, idempotencyKey, ct);
        return FromResult(result, r => r.Created ? Created($"/v1/batches/{r.Batch.Id}", r.Batch) : Ok(r.Batch));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult> Get(Guid id, CancellationToken ct) => FromResult(await batches.GetAsync(User.GetClientId(), id, ct));

    // Huỷ các job còn đang chờ trong lô (job đang chạy vẫn chạy tiếp).
    [HttpPost("{id:guid}/cancel")]
    public async Task<ActionResult> Cancel(Guid id, CancellationToken ct) =>
        FromResult(await batches.CancelAsync(User.GetClientId(), id, ct));

    // Đổi giá trị JSON về chuỗi giống form của trang web: "5" và 5 như nhau, true -> "true".
    private static string? JsonText(JsonElement value) => value.ValueKind switch
    {
        JsonValueKind.String => value.GetString(),
        JsonValueKind.Null or JsonValueKind.Undefined => null,
        JsonValueKind.True => "true",
        JsonValueKind.False => "false",
        _ => value.GetRawText(),
    };
}

[Route("v1/jobs")]
[Authorize(AuthenticationSchemes = AuthSchemes.ApiKey)]
public sealed class ClientJobsController(ClientJobService jobs) : ApiControllerBase
{
    [HttpGet("{id:guid}")]
    public async Task<ActionResult> Get(Guid id, CancellationToken ct) => FromResult(await jobs.GetAsync(User.GetClientId(), id, ct));

    // Link tải kết quả (6 giờ). Hết hạn thì gọi lại để lấy link mới.
    [HttpGet("{id:guid}/result")]
    public async Task<ActionResult> Result(Guid id, CancellationToken ct) =>
        FromResult(await jobs.GetResultLinkAsync(User.GetClientId(), id, BaseUrl, ct));
}
