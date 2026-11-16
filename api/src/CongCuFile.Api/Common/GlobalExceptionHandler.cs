using Microsoft.AspNetCore.Diagnostics;

namespace CongCuFile.Api.Common;

// Lỗi bất ngờ (mất database, hỏng ổ đĩa...): ghi log đầy đủ, trả 500 với câu lỗi chung,
// không lộ chi tiết kỹ thuật ra ngoài.
internal sealed class GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext context, Exception exception, CancellationToken ct)
    {
        logger.LogError(exception, "Lỗi không xử lý được ở {Method} {Path}", context.Request.Method, context.Request.Path);
        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        await context.Response.WriteAsJsonAsync(new ErrorResponse("Lỗi máy chủ, hãy thử lại sau."), ct);
        return true;
    }
}
