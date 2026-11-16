namespace CongCuFile.Domain.Catalog;

// Danh mục các loại job API nhận.
// Thêm công cụ mới: thêm handler ở worker (worker/handlers/__init__.py) rồi thêm một dòng ở đây.
// Trang web đọc danh mục này qua GET /api/job-types nên tự hiện công cụ mới.
public static partial class JobCatalog
{
    // Nhóm đuôi file dùng lại nhiều lần.
    static readonly string[] Images = [".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".tif", ".tiff", ".heic", ".heif", ".avif"];
    static readonly string[] Videos = [".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v", ".wmv", ".flv", ".3gp"];
    static readonly string[] Audios = [".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".opus", ".wma"];
    // Ảnh RAW của các hãng máy ảnh (RawTherapee đọc được qua thư viện LibRaw/dcraw).
    static readonly string[] RawImages = [".cr2", ".cr3", ".crw", ".nef", ".nrw", ".arw", ".srf", ".sr2", ".raf", ".orf",
        ".rw2", ".pef", ".dng", ".srw", ".3fr", ".iiq", ".erf", ".mos", ".rwl", ".x3f"];

    public static readonly Dictionary<string, JobTypeInfo> Types = new()
    {
        // ---------- Đổi sang PDF ----------
        ["word-to-pdf"] = new("Word sang PDF", [".doc", ".docx", ".odt", ".rtf", ".txt"]),
        ["excel-to-pdf"] = new("Excel sang PDF", [".xls", ".xlsx", ".ods", ".csv"]),
        ["powerpoint-to-pdf"] = new("PowerPoint sang PDF", [".ppt", ".pptx", ".odp"]),
        ["image-to-pdf"] = new("Ảnh sang PDF", Images),
        ["html-to-pdf"] = new("HTML sang PDF", [".html", ".htm"]),
        ["markdown-to-pdf"] = new("Markdown sang PDF", [".md", ".markdown"]),
        ["ebook-to-pdf"] = new("Ebook sang PDF", [".epub", ".mobi", ".azw3", ".fb2"]),
        ["email-to-pdf"] = new("Email sang PDF", [".eml", ".msg"]),
        ["comic-to-pdf"] = new("Truyện tranh (CBZ) sang PDF", [".cbz"]),
        ["svg-to-pdf"] = new("SVG sang PDF", [".svg"]),
        ["postscript-to-pdf"] = new("PostScript sang PDF", [".ps", ".eps"]),
        ["xps-to-pdf"] = new("XPS sang PDF", [".xps", ".oxps"]),
        ["djvu-to-pdf"] = new("DjVu sang PDF", [".djvu", ".djv"]),
        ["dxf-to-pdf"] = new("Bản vẽ DXF sang PDF", [".dxf"]),

        // ---------- Đổi từ PDF ----------
        ["pdf-to-word"] = new("PDF sang Word", [".pdf"]),
        ["pdf-to-excel"] = new("PDF sang Excel", [".pdf"]),
        ["pdf-to-powerpoint"] = new("PDF sang PowerPoint", [".pdf"]),
        ["pdf-to-jpg"] = new("PDF sang JPG", [".pdf"]),
        ["pdf-to-png"] = new("PDF sang PNG", [".pdf"]),
        ["pdf-to-text"] = new("PDF sang Text", [".pdf"]),
        ["pdf-to-html"] = new("PDF sang HTML", [".pdf"]),
        ["pdf-to-epub"] = new("PDF sang EPUB", [".pdf"]),

        // ---------- Công cụ PDF ----------
        ["compress-pdf"] = new("Nén PDF", [".pdf"],
        [
            // Mức nén của Stirling-PDF (1 nhẹ nhất đến 9 mạnh nhất). Mức 1-3 gần như không giảm,
            // mức 9 làm ảnh quá mờ, nên chỉ cho chọn 3 mức này (đã đo, xem CLAUDE.md).
            new JobOption("level", "Mức nén", Default: "5", Choices:
            [
                new("4", "Nhẹ: ảnh nét, file to hơn"),
                new("5", "Vừa (khuyên dùng)"),
                new("8", "Mạnh: file nhỏ nhất, ảnh mờ hơn"),
            ]),
        ]),
        ["rotate-pdf"] = new("Xoay PDF", [".pdf"],
        [
            new JobOption("angle", "Xoay", Default: "90", Choices:
            [
                new("90", "Sang phải 90°"),
                new("180", "Lộn ngược 180°"),
                new("270", "Sang trái 90°"),
            ]),
        ]),
        ["remove-pages"] = new("Xoá trang PDF", [".pdf"], [PagesOption("Các trang cần xoá")]),
        ["extract-pages"] = new("Trích xuất trang PDF", [".pdf"], [PagesOption("Các trang cần lấy")]),
        ["protect-pdf"] = new("Đặt mật khẩu PDF", [".pdf"],
        [
            new JobOption("password", "Mật khẩu mới", Kind: "password", Required: true, MaxLength: 100,
                Hint: "Người mở file phải nhập mật khẩu này. Hãy ghi nhớ: quên là không mở được."),
        ]),
        ["unlock-pdf"] = new("Mở khoá PDF", [".pdf"],
        [
            new JobOption("password", "Mật khẩu hiện tại của file", Kind: "password", Required: true, MaxLength: 100,
                Hint: "Chỉ gỡ được khi bạn biết mật khẩu. File kết quả sẽ không còn mật khẩu."),
        ]),
        ["watermark-pdf"] = new("Thêm watermark", [".pdf"],
        [
            new JobOption("text", "Chữ watermark", Kind: "text", Required: true, MaxLength: 60,
                Placeholder: "Ví dụ: BẢN NHÁP, MẬT, Công ty ABC"),
        ]),
        ["page-numbers-pdf"] = new("Đánh số trang", [".pdf"],
        [
            new JobOption("position", "Vị trí số trang", Default: "8", Choices:
            [
                new("8", "Dưới, ở giữa"),
                new("9", "Dưới, bên phải"),
                new("2", "Trên, ở giữa"),
                new("3", "Trên, bên phải"),
            ]),
            new JobOption("format", "Kiểu hiển thị", Default: "{n}", Choices:
            [
                new("{n}", "1, 2, 3..."),
                new("{n}/{total}", "1/10, 2/10..."),
                new("Trang {n}", "Trang 1, Trang 2..."),
            ]),
        ]),
        ["ocr-pdf"] = new("OCR PDF", [".pdf"]),

        // ---------- Ảnh (worker thường: Pillow) ----------
        ["compress-image"] = new("Nén ảnh", [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".avif"],
        [
            new JobOption("level", "Mức nén", Default: "medium", Choices:
            [
                new("light", "Nhẹ: gần như không thấy khác biệt"),
                new("medium", "Vừa (khuyên dùng)"),
                new("strong", "Mạnh: file nhỏ nhất"),
            ]),
        ]),
        ["convert-image"] = new("Đổi định dạng ảnh", Images,
        [
            new JobOption("format", "Đổi sang", Default: "jpg", Choices:
            [
                new("jpg", "JPG"),
                new("png", "PNG"),
                new("webp", "WebP"),
                new("pdf", "PDF"),
            ]),
        ]),

        ["image-to-text"] = new("Ảnh sang chữ", Images,
        [
            new JobOption("format", "Kết quả", Default: "txt", Choices:
            [
                new("txt", "Chữ (.txt) để sao chép"),
                new("pdf", "PDF có chữ tìm kiếm được"),
            ]),
        ]),

        // ---------- Video, âm thanh (worker thường: FFmpeg) ----------
        ["compress-video"] = new("Nén video", Videos,
        [
            new JobOption("level", "Mức nén", Default: "medium", Choices:
            [
                new("light", "Nhẹ: giữ chất lượng"),
                new("medium", "Vừa: tối đa Full HD 1080p (khuyên dùng)"),
                new("strong", "Mạnh: tối đa HD 720p, file nhỏ nhất"),
            ]),
        ]),
        ["convert-video"] = new("Đổi định dạng video", Videos,
        [
            new JobOption("format", "Đổi sang", Default: "mp4", Choices:
            [
                new("mp4", "MP4 (phổ biến nhất)"),
                new("webm", "WebM"),
                new("mov", "MOV"),
                new("mkv", "MKV"),
            ]),
        ]),
        ["convert-audio"] = new("Đổi định dạng âm thanh", Audios,
        [
            new JobOption("format", "Đổi sang", Default: "mp3", Choices:
            [
                new("mp3", "MP3"),
                new("wav", "WAV"),
                new("m4a", "M4A"),
                new("flac", "FLAC"),
                new("ogg", "OGG"),
            ]),
        ]),
        ["video-to-mp3"] = new("Video sang MP3", Videos),
        ["trim-video"] = new("Cắt video", Videos,
        [
            // Trang "Cắt video" tự điền hai ô này khi người dùng kéo chọn đoạn trên video.
            new JobOption("start", "Bắt đầu (giây)", Kind: "text", Required: true, MaxLength: 12,
                Pattern: @"^\d+(\.\d+)?$", Placeholder: "Ví dụ: 12.5"),
            new JobOption("end", "Kết thúc (giây)", Kind: "text", Required: true, MaxLength: 12,
                Pattern: @"^\d+(\.\d+)?$", Placeholder: "Ví dụ: 45"),
        ]),

        // ---------- AI (worker AI: nên chạy trên máy có GPU) ----------
        ["transcribe-audio"] = new("Âm thanh sang chữ", Audios, TranscribeOptions(), Worker: "ai"),
        ["transcribe-video"] = new("Video sang chữ", Videos, TranscribeOptions(), Worker: "ai"),
        ["transcribe-youtube"] = new("Chép lời YouTube", [], TranscribeOptions(), Worker: "ai",
            Input: "url",
            // Chỉ nhận link YouTube: không cho máy xử lý tải địa chỉ tuỳ ý (có thể bị lợi dụng để
            // truy cập vào mạng nội bộ của máy nhà).
            UrlPattern: @"^https://(www\.|m\.)?(youtube\.com/(watch\?v=|shorts/)|youtu\.be/)[A-Za-z0-9_\-]{6,}([?&#].*)?$"),
        ["noise-remove"] = new("Lọc tạp âm", Audios, Worker: "ai"),
        ["vocal-remove"] = new("Tách giọng hát", Audios,
        [
            new JobOption("output", "Lấy phần nào", Default: "both", Choices:
            [
                new("both", "Cả hai: giọng hát và nhạc nền (file .zip)"),
                new("vocals", "Chỉ giọng hát"),
                new("music", "Chỉ nhạc nền (karaoke)"),
            ]),
        ], Worker: "ai"),
        ["enhance-image"] = new("Làm nét ảnh", [".jpg", ".jpeg", ".png", ".webp"],
        [
            new JobOption("scale", "Phóng to", Default: "2", Choices:
            [
                new("2", "Gấp 2 lần"),
                new("4", "Gấp 4 lần"),
            ]),
        ], Worker: "ai"),
        ["summarize-document"] = new("Tóm tắt tài liệu", [".pdf", ".txt", ".docx", ".md"],
        [
            new JobOption("length", "Độ dài bản tóm tắt", Default: "medium", Choices:
            [
                new("short", "Ngắn: vài câu"),
                new("medium", "Vừa: các ý chính (khuyên dùng)"),
                new("long", "Chi tiết: theo từng phần"),
            ]),
        ], Worker: "ai"),
        ["translate-document"] = new("Dịch tài liệu", [".pdf", ".txt", ".docx", ".md"],
        [
            new JobOption("target", "Dịch sang", Default: "vi", Choices:
            [
                new("vi", "Tiếng Việt"),
                new("en", "Tiếng Anh"),
                new("zh", "Tiếng Trung"),
                new("ja", "Tiếng Nhật"),
                new("ko", "Tiếng Hàn"),
            ]),
        ], Worker: "ai"),
        ["translate-pdf"] = new("Dịch PDF giữ bố cục", [".pdf"],
        [
            new JobOption("target", "Dịch sang", Default: "vi", Choices:
            [
                new("vi", "Tiếng Việt"),
                new("en", "Tiếng Anh"),
                new("zh", "Tiếng Trung"),
                new("ja", "Tiếng Nhật"),
                new("ko", "Tiếng Hàn"),
            ]),
            new JobOption("output", "Kết quả", Default: "mono", Choices:
            [
                new("mono", "Chỉ bản dịch"),
                new("dual", "Song ngữ: bản gốc và bản dịch xen kẽ"),
            ]),
        ], Worker: "ai"),
        ["text-to-speech"] = new("Văn bản sang giọng nói", [],
        [
            new JobOption("text", "Văn bản cần đọc", Kind: "textarea", Required: true, MaxLength: 5000,
                Placeholder: "Dán hoặc gõ văn bản tiếng Việt (tối đa 5000 ký tự)"),
            // Tên giọng là giọng có sẵn của VieNeu-TTS (xem worker/handlers/ai_speech.py, preset_voices()).
            new JobOption("voice", "Giọng đọc", Default: "Hải Đăng", Choices:
            [
                new("Hải Đăng", "Hải Đăng: nam, miền Bắc, tự nhiên"),
                new("Ngọc Huyền", "Ngọc Huyền: nữ, miền Bắc, tự nhiên"),
                new("Mai Anh", "Mai Anh: nữ, miền Bắc, đọc tin tức"),
                new("Thiện Minh", "Thiện Minh: nam, miền Bắc, kể chuyện"),
                new("Thùy Dung", "Thùy Dung: nữ, miền Nam, đọc tin tức"),
                new("Thái Sơn", "Thái Sơn: nam, miền Nam, kể chuyện"),
                new("Ngọc Trân", "Ngọc Trân: nữ, miền Trung, tự nhiên"),
                new("Quang Sơn", "Quang Sơn: nam, miền Trung, tự nhiên"),
            ]),
        ], Worker: "ai", Input: "none"),
        ["generate-music"] = new("Tạo nhạc AI", [],
        [
            new JobOption("prompt", "Mô tả bản nhạc", Kind: "textarea", Required: true, MaxLength: 500,
                Placeholder: "Ví dụ: nhạc pop vui tươi, guitar và piano, giọng nữ trong trẻo",
                Hint: "Mô tả thể loại, nhạc cụ, tâm trạng, giọng hát. Viết tiếng Anh thường cho kết quả tốt hơn."),
            new JobOption("lyrics", "Lời bài hát (không bắt buộc)", Kind: "textarea", MaxLength: 3000,
                Placeholder: "[verse]\nLời đoạn 1...\n[chorus]\nLời điệp khúc...",
                Hint: "Để trống nếu chỉ muốn nhạc không lời."),
            new JobOption("duration", "Độ dài", Default: "60", Choices:
            [
                new("30", "30 giây"),
                new("60", "1 phút"),
                new("120", "2 phút"),
            ]),
        ], Worker: "ai", Input: "none"),

        // ---------- Ảnh cho nhiếp ảnh gia (máy "photo": RawTherapee + ExifTool, không AI) ----------
        ["raw-develop"] = new("Rửa ảnh RAW", RawImages,
        [
            new JobOption("preset", "Kiểu rửa", Default: "natural", Choices:
            [
                new("natural", "Tự nhiên: làm nét nhẹ, sửa lỗi ống kính"),
                new("high-iso", "Ảnh tối, ISO cao: thêm khử nhiễu"),
            ]),
            new JobOption("format", "Định dạng kết quả", Default: "jpg", Choices:
            [
                new("jpg", "JPEG chất lượng cao (giao khách)"),
                new("tif", "TIFF 16-bit (chỉnh tiếp trong Lightroom/Photoshop)"),
            ]),
        ], Worker: "photo"),
    };

    static JobOption[] TranscribeOptions() =>
    [
        new JobOption("language", "Ngôn ngữ trong file", Default: "vi", Choices:
        [
            new("vi", "Tiếng Việt"),
            new("en", "Tiếng Anh"),
            new("auto", "Tự nhận biết"),
        ]),
        new JobOption("format", "Kết quả", Default: "txt", Choices:
        [
            new("txt", "Văn bản (.txt)"),
            new("srt", "Phụ đề có mốc thời gian (.srt)"),
        ]),
    ];

    // Tuỳ chọn "số trang" dùng chung cho các công cụ xoá/trích xuất trang.
    // Chỉ cho phép chữ số, dấu phẩy, gạch ngang và khoảng trắng, ví dụ "1,3,5-7".
    static JobOption PagesOption(string label) =>
        new("pages", label, Kind: "text", Required: true, MaxLength: 200,
            Placeholder: "Ví dụ: 1,3,5-7", Pattern: @"^\s*\d+(\s*-\s*\d+)?(\s*,\s*\d+(\s*-\s*\d+)?)*\s*$",
            Hint: "Ghi số trang, cách nhau bằng dấu phẩy; dùng gạch ngang cho một đoạn (5-7 là trang 5, 6, 7).");
}

// Một loại job.
//   Label       tên hiển thị
//   Extensions  đuôi file được nhận (Input = "file")
//   OptionList  các tuỳ chọn (có thể không có)
//   Worker      "main" (worker thường), "ai" (worker AI, cần GPU) hoặc "photo" (ảnh RAW) - để báo máy nào đang tắt
//   Input       "file" (tải file lên), "url" (dán đường link) hoặc "none" (không có file, chỉ nhập chữ)
//   UrlPattern  mẫu kiểm tra đường link (Input = "url")
public record JobTypeInfo(string Label, string[] Extensions, JobOption[]? OptionList = null,
    string Worker = "main", string Input = "file", string? UrlPattern = null)
{
    public JobOption[] Options => OptionList ?? [];
}

// Một tuỳ chọn của công cụ.
//   Name        tên kỹ thuật, gửi trong form (ví dụ "level")
//   Label       tên hiển thị trên trang
//   Default     giá trị khi người dùng không chọn/không nhập
//   Choices     các lựa chọn (Kind = "choice")
//   Kind        "choice" (chọn một), "text" (ô nhập một dòng), "textarea" (ô nhập nhiều dòng),
//               "password" (ô mật khẩu: bị che, không lưu lại)
//   Placeholder chữ mờ gợi ý trong ô nhập
//   Pattern     mẫu kiểm tra (regex) cho ô nhập
//   MaxLength   số ký tự tối đa
//   Required    bắt buộc nhập
//   Hint        dòng giải thích dưới ô nhập
public record JobOption(string Name, string Label, string Default = "", OptionChoice[]? Choices = null,
    string Kind = "choice", string? Placeholder = null, string? Pattern = null, int MaxLength = 200,
    bool Required = false, string? Hint = null);

public record OptionChoice(string Value, string Label);
