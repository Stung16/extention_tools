using CongCuFile.Api.Common;
using CongCuFile.Application.Storage;
using CongCuFile.Application.Uploads;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Mvc;

namespace CongCuFile.Api.Controllers.V1;

// Link tải lên / tải về có chữ ký, do kho file trên ổ đĩa cấp (/v1/files/<khoá>?exp=...&sig=...).
// Không cần khoá API: chữ ký trong link đã chứng minh link do API cấp. Khi chuyển sang kho S3,
// link trỏ thẳng vào kho và controller này không còn được dùng.
[Route("v1/files")]
public sealed class SignedFilesController(UploadService uploads, SignedFileService files) : ApiControllerBase
{
    // Nhận nội dung file (thân request là file thô, không phải form).
    [HttpPut("{**key}")]
    public async Task<ActionResult> Put(string key, [FromQuery] long exp, [FromQuery] string? sig, CancellationToken ct)
    {
        var pending = await uploads.BeginReceiveAsync(key, exp, sig, Request.ContentLength, ct);
        if (!pending.IsSuccess) return ErrorResult(pending.Error!);

        // Giới hạn chung 100 MB là cho form của trang web; ở đây cho phép đúng bằng dung lượng đã khai.
        if (HttpContext.Features.Get<IHttpMaxRequestBodySizeFeature>() is { IsReadOnly: false } limit)
            limit.MaxRequestBodySize = pending.Value.DeclaredSize;

        return FromResult(await uploads.ReceiveAsync(key, Request.Body, ct));
    }

    [HttpGet("{**key}")]
    public ActionResult Get(string key, [FromQuery] long exp, [FromQuery] string? sig, [FromQuery] string? name) =>
        FromResult(files.Open(key, exp, name, sig), file => SendFile(file));
}
