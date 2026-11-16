using System.Collections.Concurrent;
using CongCuFile.Application.Common;
using CongCuFile.Domain.Jobs;

namespace CongCuFile.Application.Workers;

// Ghi nhớ lần cuối mỗi loại job có worker hỏi tới, để biết máy xử lý nào đang bật.
// Chỉ lưu trong bộ nhớ (đăng ký Singleton): API khởi động lại thì quên, worker hỏi lại sau vài giây là có.
public sealed class WorkerPresence(IClock clock)
{
    private readonly ConcurrentDictionary<string, DateTime> _lastSeen = new();

    public void MarkSeen(IEnumerable<string> types)
    {
        var now = clock.UtcNow;
        foreach (var type in types) _lastSeen[type] = now;
    }

    public DateTime? LastSeen(string type) => _lastSeen.TryGetValue(type, out var t) ? t : null;

    public bool IsOnline(string type) => LastSeen(type) is { } t && clock.UtcNow - t < JobPolicy.WorkerOnlineWindow;
}
