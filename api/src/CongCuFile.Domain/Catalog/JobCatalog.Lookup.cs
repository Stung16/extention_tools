namespace CongCuFile.Domain.Catalog;

// Các hàm tra cứu danh mục (phần danh sách công cụ nằm ở JobCatalog.cs).
public static partial class JobCatalog
{
    public static bool TryGet(string type, out JobTypeInfo info) => Types.TryGetValue(type, out info!);

    // Tên hiển thị của loại job; loại không còn trong danh mục thì hiện mã loại.
    public static string Label(string type) => Types.TryGetValue(type, out var t) ? t.Label : type;

    // Nhóm worker xử lý loại job này ("main", "ai", "photo"); không rõ thì "?".
    public static string WorkerOf(string type) => Types.TryGetValue(type, out var t) ? t.Worker : "?";

    // Loại job đọc từ file người dùng tải lên ("file"), từ đường link ("url") hay không có đầu vào ("none").
    public static string InputOf(string type) => Types.TryGetValue(type, out var t) ? t.Input : "file";

    // Tên các tuỳ chọn bí mật (Kind = "password") của loại job.
    public static IEnumerable<string> SecretOptionNames(string type) =>
        Types.TryGetValue(type, out var t) ? t.Options.Where(o => o.Kind == "password").Select(o => o.Name) : [];
}
