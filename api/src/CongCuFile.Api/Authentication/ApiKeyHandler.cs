using System.Security.Claims;
using System.Text.Encodings.Web;
using CongCuFile.Api.Common;
using CongCuFile.Application.Admin;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace CongCuFile.Api.Authentication;

// Xác thực app khách bằng khoá API: header "Authorization: Bearer ccf_...".
// Thành công thì Id của app nằm trong User (đọc bằng User.GetClientId()).
internal sealed class ApiKeyHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder, ApiClientService clients)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    private const string BearerPrefix = "Bearer ";
    private const string ErrorItem = "auth.apikey.error";

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var header = Request.Headers.Authorization.ToString();
        if (!header.StartsWith(BearerPrefix, StringComparison.Ordinal))
            return Fail("Thiếu khoá API (header Authorization: Bearer <khoá>).");

        var client = await clients.AuthenticateAsync(header[BearerPrefix.Length..].Trim(), Context.RequestAborted);
        if (client is null)
            return Fail("Khoá API không hợp lệ hoặc đã bị khoá.");

        var identity = new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, client.Id.ToString()), new Claim(ClaimTypes.Name, client.Name)], Scheme.Name);
        return AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name));
    }

    private AuthenticateResult Fail(string message)
    {
        Context.Items[ErrorItem] = message;
        return AuthenticateResult.Fail(message);
    }

    protected override async Task HandleChallengeAsync(AuthenticationProperties properties)
    {
        Response.StatusCode = StatusCodes.Status401Unauthorized;
        var message = Context.Items[ErrorItem] as string ?? "Thiếu khoá API (header Authorization: Bearer <khoá>).";
        await Response.WriteAsJsonAsync(new ErrorResponse(message));
    }
}

public static class ClaimsPrincipalExtensions
{
    // Id của app khách đang gọi (chỉ dùng trong controller có [Authorize(AuthenticationSchemes = AuthSchemes.ApiKey)]).
    public static Guid GetClientId(this ClaimsPrincipal user) =>
        Guid.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier) ?? throw new InvalidOperationException("Chưa xác thực app khách."));
}
