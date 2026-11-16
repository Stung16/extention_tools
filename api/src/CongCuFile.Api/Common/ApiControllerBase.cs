using CongCuFile.Application.Common;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.StaticFiles;

namespace CongCuFile.Api.Common;

// Mọi lỗi của API trả về dạng {"error": "câu thông báo"}: trang web, worker, app giám sát đều đọc trường này.
public sealed record ErrorResponse(string Error);

// Lớp gốc của mọi controller: đổi Result của tầng nghiệp vụ sang phản hồi HTTP.
// Controller chỉ làm 3 việc: đọc request -> gọi service -> trả FromResult(...).
[ApiController]
public abstract class ApiControllerBase : ControllerBase
{
    private static readonly FileExtensionContentTypeProvider ContentTypes = new();

    // Địa chỉ gốc của API (để tạo link tải lên/tải về đầy đủ cho app khách).
    protected string BaseUrl => $"{Request.Scheme}://{Request.Host}";

    protected ActionResult FromResult(Result result) => result.IsSuccess ? Ok() : ErrorResult(result.Error!);

    // onSuccess: cách trả khi thành công (mặc định 200 kèm dữ liệu).
    protected ActionResult FromResult<T>(Result<T> result, Func<T, ActionResult>? onSuccess = null) =>
        result.IsSuccess ? onSuccess?.Invoke(result.Value) ?? Ok(result.Value) : ErrorResult(result.Error!);

    protected ActionResult ErrorResult(Error error) => error.Kind switch
    {
        ErrorKind.Validation => BadRequest(new ErrorResponse(error.Message)),
        ErrorKind.NotFound => NotFound(new ErrorResponse(error.Message)),
        ErrorKind.Conflict => Conflict(new ErrorResponse(error.Message)),
        ErrorKind.Forbidden => StatusCode(StatusCodes.Status403Forbidden, new ErrorResponse(error.Message)),
        ErrorKind.Gone => StatusCode(StatusCodes.Status410Gone, new ErrorResponse(error.Message)),
        _ => StatusCode(StatusCodes.Status500InternalServerError, new ErrorResponse(error.Message)),
    };

    // Trả file về trình duyệt. Không ghi contentType thì tự chọn theo đuôi tên file
    // (audio/mpeg, application/pdf...) để trình duyệt nghe/xem thử được ngay. Hỗ trợ tải tiếp (Range).
    protected FileStreamResult SendFile(FileDownload file, string? contentType = null) =>
        File(file.Content, contentType ?? ContentTypeOf(file.FileName), file.FileName, enableRangeProcessing: true);

    private static string ContentTypeOf(string fileName) =>
        ContentTypes.TryGetContentType(fileName, out var type) ? type : "application/octet-stream";
}
