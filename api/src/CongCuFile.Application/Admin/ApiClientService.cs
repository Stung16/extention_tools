using CongCuFile.Application.Abstractions;
using CongCuFile.Application.Common;
using CongCuFile.Application.Security;
using CongCuFile.Domain.Entities;

namespace CongCuFile.Application.Admin;

// Key chỉ có ở đây, một lần duy nhất lúc tạo.
public sealed record CreatedClientDto(Guid Id, string Name, string KeyPrefix, string Key);

public sealed record ClientDto(Guid Id, string Name, string KeyPrefix, DateTime CreatedAt, bool Disabled);

// Quản lý app khách (các app gọi API v1) và kiểm tra khoá API.
public sealed class ApiClientService(IApiClientRepository clients, IUnitOfWork unitOfWork, IClock clock)
{
    public async Task<Result<CreatedClientDto>> CreateAsync(string? name, CancellationToken ct)
    {
        name = (name ?? "").Trim();
        if (name.Length is 0 or > 100) return Error.Validation("Tên app phải có từ 1 tới 100 ký tự.");

        var key = ApiKeyHasher.Generate();
        var client = new ApiClient
        {
            Id = Guid.NewGuid(), Name = name, KeyPrefix = key[..10], KeyHash = ApiKeyHasher.Hash(key), CreatedAt = clock.UtcNow,
        };
        clients.Add(client);
        await unitOfWork.SaveChangesAsync(ct);
        return new CreatedClientDto(client.Id, client.Name, client.KeyPrefix, key);
    }

    public async Task<List<ClientDto>> ListAsync(CancellationToken ct) =>
        (await clients.ListAsync(ct)).Select(c => new ClientDto(c.Id, c.Name, c.KeyPrefix, c.CreatedAt, c.Disabled)).ToList();

    // Khoá app khách: khoá API không dùng được nữa. Job đã tạo vẫn chạy tiếp.
    public async Task<Result> DisableAsync(Guid id, CancellationToken ct) =>
        await clients.DisableAsync(id, ct) ? Result.Success() : Error.NotFound("Không tìm thấy app.");

    // Trả về app khách ứng với khoá, hoặc null nếu khoá sai / app đã bị khoá.
    public async Task<ApiClient?> AuthenticateAsync(string rawKey, CancellationToken ct)
    {
        var client = await clients.FindByKeyHashAsync(ApiKeyHasher.Hash(rawKey), ct);
        return client is { Disabled: false } ? client : null;
    }
}
