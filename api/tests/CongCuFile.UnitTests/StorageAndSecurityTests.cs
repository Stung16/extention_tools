using CongCuFile.Application.Common;
using CongCuFile.Application.Security;
using CongCuFile.Application.Storage;
using CongCuFile.Infrastructure.Storage;

namespace CongCuFile.UnitTests;

public sealed class FileKeysTests
{
    [Theory]
    [InlineData("uploads/0f8fad5b-d9cb-469f-a165-70867728950e.arw", true)]
    [InlineData("web/0f8fad5b-d9cb-469f-a165-70867728950e-input.png", true)]
    [InlineData("results/0f8fad5b-d9cb-469f-a165-70867728950e", true)]
    [InlineData("../jobs.db", false)]                                          // không thoát ra ngoài kho
    [InlineData("uploads/../../jobs.db", false)]
    [InlineData("khac/0f8fad5b-d9cb-469f-a165-70867728950e.png", false)]       // thư mục lạ
    [InlineData("uploads\\0f8fad5b-d9cb-469f-a165-70867728950e.png", false)]
    public void Only_keys_created_by_the_api_are_valid(string key, bool valid) => Assert.Equal(valid, FileKeys.IsValid(key));

    [Theory]
    [InlineData("anh.JPG", ".jpg")]
    [InlineData("a.tar.gz", ".gz")]
    [InlineData("khong-duoi", "")]
    [InlineData("la.ex e", "")]
    public void Safe_extension(string name, string expected) => Assert.Equal(expected, FileKeys.SafeExt(name));
}

public sealed class LocalFileStoreTests : IDisposable
{
    private sealed class TestClock : IClock
    {
        public DateTime UtcNow { get; set; } = new(2026, 11, 17, 8, 0, 0, DateTimeKind.Utc);
    }

    private const string Key = "results/0f8fad5b-d9cb-469f-a165-70867728950e.png";
    private readonly string _root = Path.Combine(Path.GetTempPath(), "congcufile-unit", Guid.NewGuid().ToString("N"));
    private readonly TestClock _clock = new();
    private readonly LocalFileStore _store;

    public LocalFileStoreTests() => _store = new LocalFileStore(_root, "khoa-ky", _clock);

    public void Dispose()
    {
        if (Directory.Exists(_root)) Directory.Delete(_root, recursive: true);
    }

    private static (long Exp, string? Name, string Sig) Parse(string url)
    {
        var query = new Uri(url).Query.TrimStart('?').Split('&').Select(p => p.Split('=', 2))
            .ToDictionary(p => p[0], p => Uri.UnescapeDataString(p[1]));
        return (long.Parse(query["exp"], System.Globalization.CultureInfo.InvariantCulture), query.GetValueOrDefault("name"), query["sig"]);
    }

    [Fact]
    public void Download_link_verifies_only_unchanged_and_unexpired()
    {
        var (exp, name, sig) = Parse(_store.DownloadUrl("http://x", Key, "anh.png", _clock.UtcNow.AddHours(1)));

        Assert.True(_store.Verify("GET", Key, exp, name, sig));
        Assert.False(_store.Verify("PUT", Key, exp, name, sig));          // link tải về không dùng để tải lên
        Assert.False(_store.Verify("GET", Key, exp, "khac.png", sig));    // sửa tên file
        Assert.False(_store.Verify("GET", Key, exp + 60, name, sig));     // sửa thời hạn

        _clock.UtcNow = _clock.UtcNow.AddHours(2);
        Assert.False(_store.Verify("GET", Key, exp, name, sig));          // hết hạn
    }

    [Fact]
    public void Writes_reads_and_measures_files()
    {
        using (var w = _store.OpenWrite(Key)) w.Write([1, 2, 3]);

        Assert.True(_store.Exists(Key));
        Assert.Equal(3, _store.Size(Key));
        Assert.Equal((1, 3L), _store.Usage());

        _store.Delete(Key);
        Assert.False(_store.Exists(Key));
    }

    [Fact]
    public void Invalid_key_is_refused() => Assert.Throws<ArgumentException>(() => _store.OpenWrite("../../ngoai-kho.txt"));
}

public sealed class ApiKeyHasherTests
{
    [Fact]
    public void Generated_keys_are_unique_and_prefixed()
    {
        var a = ApiKeyHasher.Generate();
        var b = ApiKeyHasher.Generate();
        Assert.StartsWith("ccf_", a, StringComparison.Ordinal);
        Assert.NotEqual(a, b);
        Assert.True(a.Length > 40);
    }

    [Fact]
    public void Hash_is_stable_and_does_not_contain_the_key()
    {
        var key = ApiKeyHasher.Generate();
        Assert.Equal(ApiKeyHasher.Hash(key), ApiKeyHasher.Hash(key));
        Assert.DoesNotContain(key, ApiKeyHasher.Hash(key), StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("abc", "abc", true)]
    [InlineData("abd", "abc", false)]
    [InlineData(null, "abc", false)]
    [InlineData("", "abc", false)]
    public void Same_secret(string? given, string expected, bool same) => Assert.Equal(same, ApiKeyHasher.SameSecret(given, expected));
}
