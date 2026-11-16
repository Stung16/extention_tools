using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using System.Text.Encodings.Web;
using CongCuFile.Api.Common;
using CongCuFile.Application.Security;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace CongCuFile.Api.Authentication;

// Tên các cách xác thực. Controller ghi [Authorize(AuthenticationSchemes = AuthSchemes.Worker)] ...
public static class AuthSchemes
{
    public const string Worker = "WorkerKey";  // header X-Worker-Key   (máy xử lý)
    public const string Admin = "AdminKey";    // header X-Admin-Key    (app giám sát)
    public const string ApiKey = "ApiKey";     // Authorization: Bearer (app khách, API v1)
}

// Các mã bí mật trong cấu hình (appsettings hoặc biến môi trường WorkerKey, AdminKey).
public sealed class SecurityOptions
{
    [Required(ErrorMessage = "Chưa cấu hình WorkerKey.")]
    public string WorkerKey { get; set; } = "";

    [Required(ErrorMessage = "Chưa cấu hình AdminKey.")]
    public string AdminKey { get; set; } = "";
}

// Xác thực bằng một mã bí mật cố định gửi trong header (dùng cho worker và app giám sát).
internal abstract class SecretHeaderHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder, IOptions<SecurityOptions> security)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected abstract string HeaderName { get; }
    protected abstract string ExpectedSecret(SecurityOptions security);

    protected SecurityOptions Security => security.Value;

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var given = Request.Headers[HeaderName].ToString();
        if (!ApiKeyHasher.SameSecret(given, ExpectedSecret(Security)))
            return Task.FromResult(AuthenticateResult.Fail($"Sai {HeaderName}."));

        var identity = new ClaimsIdentity([new Claim(ClaimTypes.Name, Scheme.Name)], Scheme.Name);
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name)));
    }

    // Thiếu hoặc sai mã: trả 401 kèm câu lỗi JSON như mọi lỗi khác của API.
    protected override async Task HandleChallengeAsync(AuthenticationProperties properties)
    {
        Response.StatusCode = StatusCodes.Status401Unauthorized;
        await Response.WriteAsJsonAsync(new ErrorResponse($"Thiếu hoặc sai {HeaderName}."));
    }
}

internal sealed class WorkerKeyHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder, IOptions<SecurityOptions> security)
    : SecretHeaderHandler(options, logger, encoder, security)
{
    protected override string HeaderName => "X-Worker-Key";
    protected override string ExpectedSecret(SecurityOptions s) => s.WorkerKey;
}

internal sealed class AdminKeyHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder, IOptions<SecurityOptions> security)
    : SecretHeaderHandler(options, logger, encoder, security)
{
    protected override string HeaderName => "X-Admin-Key";
    protected override string ExpectedSecret(SecurityOptions s) => s.AdminKey;
}
