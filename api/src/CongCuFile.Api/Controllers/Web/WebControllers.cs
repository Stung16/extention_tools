using CongCuFile.Api.Common;
using CongCuFile.Application.Common;
using CongCuFile.Application.Jobs;
using Microsoft.AspNetCore.Mvc;

namespace CongCuFile.Api.Controllers.Web;

// Cửa cho trang web công cụ của chính mình (người dùng ẩn danh, không cần khoá).

[Route("api/job-types")]
public sealed class JobTypesController(JobTypeQueries queries) : ApiControllerBase
{
    // Danh sách công cụ, kèm Online = máy xử lý loại đó đang bật.
    [HttpGet]
    public IEnumerable<JobTypeDto> Get() => queries.ForWebsite();
}

[Route("api/jobs")]
public sealed class JobsController(WebJobService jobs) : ApiControllerBase
{
    // Tạo job từ form: "type", "file" (hoặc "url"), và các tuỳ chọn của công cụ (ví dụ "level").
    [HttpPost]
    public async Task<ActionResult> Create(CancellationToken ct)
    {
        var form = await Request.ReadFormAsync(ct);
        var fields = form.Keys.ToDictionary(k => k, k => form[k].ToString());
        var upload = form.Files["file"];

        await using var content = upload?.OpenReadStream();
        var file = upload is null ? null : new IncomingFile(upload.FileName, upload.Length, content!);

        var result = await jobs.CreateAsync(form["type"].ToString(), fields, file, ct);
        return FromResult(result, created => Created($"/api/jobs/{created.Id}", created));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult> Get(Guid id, CancellationToken ct) => FromResult(await jobs.GetStatusAsync(id, ct));

    // Tải file kết quả (khi job đã xong).
    [HttpGet("{id:guid}/output")]
    public async Task<ActionResult> Output(Guid id, CancellationToken ct) =>
        FromResult(await jobs.OpenOutputAsync(id, ct), file => SendFile(file));
}
