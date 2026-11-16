using CongCuFile.Domain.Catalog;
using CongCuFile.Domain.Entities;
using CongCuFile.Domain.Enums;
using CongCuFile.Domain.Jobs;

namespace CongCuFile.UnitTests;

public sealed class JobOptionsValidatorTests
{
    private static readonly JobTypeInfo Compress = JobCatalog.Types["compress-image"];
    private static readonly JobTypeInfo Protect = JobCatalog.Types["protect-pdf"];

    [Fact]
    public void Missing_option_uses_default()
    {
        var (options, error) = JobOptionsValidator.Validate(Compress, _ => null);
        Assert.Null(error);
        Assert.Equal(Compress.Options.Single(o => o.Name == "level").Default, options!["level"]);
    }

    [Fact]
    public void Unknown_choice_is_rejected_with_label()
    {
        var (options, error) = JobOptionsValidator.Validate(Compress, _ => "khong-co");
        Assert.Null(options);
        Assert.Contains("khong-co", error);
    }

    [Fact]
    public void Required_option_must_be_given()
    {
        var (_, error) = JobOptionsValidator.Validate(Protect, _ => null);
        Assert.StartsWith("Vui lòng nhập", error, StringComparison.Ordinal);
    }

    [Fact]
    public void Password_keeps_spaces_but_text_is_trimmed()
    {
        var removePages = JobCatalog.Types["remove-pages"];
        var (pages, _) = JobOptionsValidator.Validate(removePages, _ => "  1,3  ");
        Assert.Equal("1,3", pages!["pages"]);

        var (protect, _) = JobOptionsValidator.Validate(Protect, _ => " mat khau ");
        Assert.Equal(" mat khau ", protect!["password"]);
    }

    [Fact]
    public void Pattern_is_checked()
    {
        var (_, error) = JobOptionsValidator.Validate(JobCatalog.Types["remove-pages"], _ => "1; xoa het");
        Assert.Contains("không đúng dạng", error);
    }
}

public sealed class JobTests
{
    private static readonly DateTime Now = new(2026, 11, 17, 8, 0, 0, DateTimeKind.Utc);

    [Theory]
    [InlineData("anh.png", "results/x.png", "web/x-input.png", "anh-ket-qua.png")]  // cùng đuôi: thêm -ket-qua
    [InlineData("tai-lieu.docx", "results/x.pdf", "web/x-input.docx", "tai-lieu.pdf")]
    [InlineData("ket-qua", "results/x.mp3", "", "ket-qua.mp3")]                     // job không có file đầu vào
    public void Download_name(string original, string output, string input, string expected)
    {
        var job = new Job { OriginalName = original, OutputFile = output, InputFile = input };
        Assert.Equal(expected, job.DownloadName());
    }

    [Fact]
    public void Finishing_a_job_forgets_passwords()
    {
        var job = new Job { Type = "protect-pdf" };
        job.WriteOptions(new Dictionary<string, string> { ["password"] = "bi-mat" });

        job.MarkDone("results/x.pdf", Now);

        Assert.Equal(JobStatus.Done, job.Status);
        Assert.False(job.ReadOptions().ContainsKey("password"));
    }

    [Fact]
    public void Retry_resets_attempts_and_moves_to_back_of_queue()
    {
        var job = new Job { Status = JobStatus.Failed, Attempts = 3, Error = "lỗi", CreatedAt = Now.AddHours(-1) };
        job.ResetForRetry(Now);

        Assert.Equal(JobStatus.Pending, job.Status);
        Assert.Equal(0, job.Attempts);
        Assert.Null(job.Error);
        Assert.Equal(Now, job.CreatedAt);
    }

    [Theory]
    [InlineData(JobStatus.Failed, true)]
    [InlineData(JobStatus.Cancelled, true)]
    [InlineData(JobStatus.Pending, false)]
    [InlineData(JobStatus.Processing, false)]
    [InlineData(JobStatus.Done, false)]
    public void Only_failed_or_cancelled_jobs_can_be_retried(JobStatus status, bool expected) =>
        Assert.Equal(expected, JobPolicy.CanRetry(status));
}
