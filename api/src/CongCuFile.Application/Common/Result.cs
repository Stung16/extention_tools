namespace CongCuFile.Application.Common;

// Loại lỗi nghiệp vụ. Tầng Api đổi sang mã HTTP (400, 404, 409, 403, 410).
public enum ErrorKind
{
    Validation,  // dữ liệu gửi lên không hợp lệ          -> 400
    NotFound,    // không tìm thấy (hoặc không thuộc quyền) -> 404
    Conflict,    // trạng thái hiện tại không cho làm việc này -> 409
    Forbidden,   // link/chữ ký không hợp lệ hoặc hết hạn  -> 403
    Gone,        // từng có nhưng đã bị xoá               -> 410
}

// Một lỗi nghiệp vụ: loại + câu thông báo tiếng Việt cho người dùng.
public sealed record Error(ErrorKind Kind, string Message)
{
    public static Error Validation(string message) => new(ErrorKind.Validation, message);
    public static Error NotFound(string message) => new(ErrorKind.NotFound, message);
    public static Error Conflict(string message) => new(ErrorKind.Conflict, message);
    public static Error Forbidden(string message) => new(ErrorKind.Forbidden, message);
    public static Error Gone(string message) => new(ErrorKind.Gone, message);
}

// Kết quả của một nghiệp vụ: thành công, hoặc thất bại kèm Error.
// Nghiệp vụ trả Result thay vì ném exception cho các lỗi bình thường (sai dữ liệu, không tìm thấy...),
// exception chỉ dành cho lỗi bất ngờ (mất database, hỏng ổ đĩa).
public class Result
{
    protected Result(Error? error) => Error = error;

    public Error? Error { get; }
    public bool IsSuccess => Error is null;

    public static Result Success() => new(null);
    public static Result Failure(Error error) => new(error);

    public static implicit operator Result(Error error) => Failure(error);
}

public sealed class Result<T> : Result
{
    private readonly T? _value;

    private Result(T value) : base(null) => _value = value;
    private Result(Error error) : base(error) { }

    // Chỉ đọc khi IsSuccess = true.
    public T Value => IsSuccess ? _value! : throw new InvalidOperationException("Kết quả thất bại không có giá trị.");

    // Viết "return giaTri;" hoặc "return Error.NotFound(...);" là tự đổi sang Result<T>.
    public static implicit operator Result<T>(T value) => new(value);
    public static implicit operator Result<T>(Error error) => new(error);
}
