using CongCuFile.Application.Abstractions;
using CongCuFile.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace CongCuFile.Infrastructure.Persistence.Repositories;

// Các bảng của app khách: lô, file tải lên, app khách.

internal sealed class BatchRepository(AppDbContext db) : IBatchRepository
{
    public void Add(Batch batch) => db.Batches.Add(batch);

    public Task<Batch?> FindForClientAsync(Guid id, Guid clientId, CancellationToken ct) =>
        db.Batches.AsNoTracking().FirstOrDefaultAsync(b => b.Id == id && b.ClientId == clientId, ct);

    public Task<Batch?> FindByIdempotencyKeyAsync(Guid clientId, string key, CancellationToken ct) =>
        db.Batches.AsNoTracking().FirstOrDefaultAsync(b => b.ClientId == clientId && b.IdempotencyKey == key, ct);
}

internal sealed class UploadRepository(AppDbContext db) : IUploadRepository
{
    public void Add(Upload upload) => db.Uploads.Add(upload);

    public Task<Upload?> FindByStorageKeyAsync(string storageKey, CancellationToken ct) =>
        db.Uploads.FirstOrDefaultAsync(u => u.StorageKey == storageKey, ct);

    public Task<Dictionary<Guid, Upload>> FindForClientAsync(Guid clientId, IReadOnlyCollection<Guid> ids, CancellationToken ct) =>
        db.Uploads.AsNoTracking().Where(u => u.ClientId == clientId && ids.Contains(u.Id)).ToDictionaryAsync(u => u.Id, ct);
}

internal sealed class ApiClientRepository(AppDbContext db) : IApiClientRepository
{
    public void Add(ApiClient client) => db.ApiClients.Add(client);

    public Task<ApiClient?> FindByKeyHashAsync(string keyHash, CancellationToken ct) =>
        db.ApiClients.AsNoTracking().FirstOrDefaultAsync(c => c.KeyHash == keyHash, ct);

    public Task<List<ApiClient>> ListAsync(CancellationToken ct) =>
        db.ApiClients.AsNoTracking().OrderBy(c => c.CreatedAt).ToListAsync(ct);

    public Task<Dictionary<Guid, string>> NamesAsync(CancellationToken ct) =>
        db.ApiClients.AsNoTracking().ToDictionaryAsync(c => c.Id, c => c.Name, ct);

    public async Task<bool> DisableAsync(Guid id, CancellationToken ct) =>
        await db.ApiClients.Where(c => c.Id == id).ExecuteUpdateAsync(s => s.SetProperty(c => c.Disabled, true), ct) == 1;
}
