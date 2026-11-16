using System.Text.RegularExpressions;
using CongCuFile.Domain.Catalog;

namespace CongCuFile.Domain.Jobs;

// Kiểm tra từng tuỳ chọn người dùng gửi theo khai báo trong JobCatalog.
// Dùng chung cho trang web (form) và API v1 (JSON) để hai cửa có cùng một luật.
public static class JobOptionsValidator
{
    // getValue(tên) trả về giá trị người dùng gửi, hoặc null nếu không gửi.
    // Thành công: Options = các tuỳ chọn đã chuẩn hoá (thiếu thì lấy mặc định), Error = null.
    public static (Dictionary<string, string>? Options, string? Error) Validate(JobTypeInfo jobType, Func<string, string?> getValue)
    {
        var options = new Dictionary<string, string>();
        foreach (var opt in jobType.Options)
        {
            var value = getValue(opt.Name) ?? "";
            if (opt.Kind is "text" or "textarea") value = value.Trim(); // mật khẩu thì giữ nguyên, kể cả dấu cách
            if (value == "")
            {
                if (opt.Required) return (null, $"Vui lòng nhập: {opt.Label}.");
                value = opt.Default;
            }

            if (opt.Choices is { Length: > 0 } choices)
            {
                if (!choices.Any(c => c.Value == value))
                    return (null, $"Giá trị '{value}' không hợp lệ cho tuỳ chọn '{opt.Label}'.");
            }
            else
            {
                if (value.Length > opt.MaxLength)
                    return (null, $"{opt.Label}: tối đa {opt.MaxLength} ký tự.");
                if (opt.Pattern is not null && !Regex.IsMatch(value, opt.Pattern))
                    return (null, $"{opt.Label} không đúng dạng. {opt.Hint}".Trim());
            }
            options[opt.Name] = value;
        }
        return (options, null);
    }
}
