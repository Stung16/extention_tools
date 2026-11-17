// Danh mục công cụ hiển thị trên trang web (chỉ là dữ liệu; các hàm tra cứu ở queries.js).
//
// Mỗi công cụ có:
//   slug    địa chỉ trang, ví dụ "nen-pdf" -> /nen-pdf
//   name    tên hiển thị;  desc  mô tả ngắn;  icon  chữ ngắn trên biểu tượng
//   job     loại job xử lý trên máy chủ (khớp api/src/CongCuFile.Domain/Catalog/JobCatalog.cs);
//           API chưa hỗ trợ thì hiện "Sắp có"
//   client  tên công cụ chạy ngay trên trình duyệt (khoá trong src/features/clientTools.js); file không gửi lên máy chủ
//   faq     (tuỳ chọn) câu hỏi thường gặp riêng: [[câu hỏi, trả lời], ...]
// Không có "job" lẫn "client" -> công cụ "Sắp có".
// Test tests/catalog.test.js kiểm tra: slug không trùng, job có trong JobCatalog.cs, client có trong clientTools.js.

import { AI_FAQ, BROWSER_FAQ, PASSWORD_FAQ, ZIP_FAQ } from "./faqs";

export const SITE_NAME = "Công Cụ File";

export const CATEGORIES = [
  {
    id: "sua-pdf",
    name: "Chỉnh sửa & sắp xếp PDF",
    tools: [
      {
        slug: "sua-pdf",
        name: "Sửa PDF",
        icon: "SỬA",
        client: "edit",
        desc: "Thêm chữ, ảnh, che bớt nội dung, vẽ trực tiếp lên PDF.",
        faq: [
          BROWSER_FAQ,
          [
            "Có sửa được chữ có sẵn trong PDF không?",
            'PDF không lưu chữ theo dòng như Word nên không sửa thẳng được. Cách làm: dùng "Che trắng" phủ lên chữ cũ rồi "Thêm chữ" mới lên trên.',
          ],
        ],
      },
      {
        slug: "nen-pdf",
        name: "Nén PDF",
        icon: "NÉN",
        job: "compress-pdf",
        desc: "Giảm dung lượng file PDF, chọn được mức nén phù hợp.",
        faq: [
          ["Nén có làm mờ chữ không?", "Không. Nén chủ yếu thu nhỏ ảnh bên trong PDF. Chữ vẫn sắc nét ở mọi mức."],
          ["Nên chọn mức nào?", '"Vừa" hợp với hầu hết trường hợp. Cần gửi email mà file vẫn to thì chọn "Mạnh".'],
          [
            "Vì sao file không nhỏ đi?",
            "File chỉ có chữ hoặc đã được nén từ trước thì gần như không giảm được nữa. Khi đó bạn nhận lại file gốc.",
          ],
        ],
      },
      {
        slug: "gop-pdf",
        name: "Gộp PDF",
        icon: "GỘP",
        client: "merge",
        desc: "Ghép nhiều file PDF thành một file, sắp xếp được thứ tự.",
        faq: [BROWSER_FAQ],
      },
      {
        slug: "tach-pdf",
        name: "Tách PDF",
        icon: "TÁCH",
        client: "split",
        desc: "Tách PDF thành từng trang hoặc theo khoảng trang.",
        faq: [BROWSER_FAQ],
      },
      {
        slug: "sap-xep-trang-pdf",
        name: "Sắp xếp trang PDF",
        icon: "XẾP",
        client: "organize",
        desc: "Kéo thả để đổi thứ tự, xoay, xoá từng trang.",
        faq: [BROWSER_FAQ],
      },
      {
        slug: "ky-pdf",
        name: "Ký PDF",
        icon: "KÝ",
        client: "sign",
        desc: "Vẽ hoặc gõ chữ ký rồi đặt vào PDF.",
        faq: [
          BROWSER_FAQ,
          [
            "Chữ ký này có giá trị pháp lý như chữ ký số không?",
            "Không. Đây là chữ ký hình ảnh (như ký tay rồi chụp lại). Chữ ký số cần chứng thư số do nhà cung cấp được cấp phép phát hành.",
          ],
        ],
      },
      {
        slug: "ghi-chu-pdf",
        name: "Ghi chú PDF",
        icon: "NOTE",
        client: "annotate",
        desc: "Tô sáng, viết, vẽ lên PDF.",
        faq: [BROWSER_FAQ],
      },
      {
        slug: "dien-bieu-mau-pdf",
        name: "Điền biểu mẫu PDF",
        icon: "FORM",
        client: "fill",
        desc: "Điền các ô trong biểu mẫu PDF, có tiếng Việt.",
        faq: [BROWSER_FAQ],
      },
      {
        slug: "cat-le-pdf",
        name: "Cắt lề PDF",
        icon: "CẮT",
        client: "crop",
        desc: "Kéo khung để cắt bớt phần lề thừa của trang.",
        faq: [BROWSER_FAQ],
      },
      {
        slug: "xoay-pdf",
        name: "Xoay PDF",
        icon: "XOAY",
        job: "rotate-pdf",
        desc: "Xoay các trang PDF 90, 180 hoặc 270 độ.",
      },
      {
        slug: "xoa-trang-pdf",
        name: "Xoá trang PDF",
        icon: "XOÁ",
        job: "remove-pages",
        desc: "Bỏ những trang không cần khỏi file PDF.",
      },
      {
        slug: "trich-xuat-trang-pdf",
        name: "Trích xuất trang PDF",
        icon: "TRÍCH",
        job: "extract-pages",
        desc: "Lấy riêng một số trang ra file mới.",
      },
      {
        slug: "dat-mat-khau-pdf",
        name: "Đặt mật khẩu PDF",
        icon: "KHOÁ",
        job: "protect-pdf",
        desc: "Bảo vệ file PDF bằng mật khẩu.",
        faq: [
          PASSWORD_FAQ,
          ["File được mã hoá mạnh tới đâu?", "Mã hoá AES 256-bit, mức mạnh nhất của chuẩn PDF."],
          ["Quên mật khẩu thì sao?", "Không có cách lấy lại. Hãy ghi nhớ hoặc lưu mật khẩu ở nơi an toàn."],
        ],
      },
      {
        slug: "mo-khoa-pdf",
        name: "Mở khoá PDF",
        icon: "MỞ",
        job: "unlock-pdf",
        desc: "Gỡ mật khẩu khỏi file PDF bạn sở hữu.",
        faq: [
          [
            "Không biết mật khẩu có mở được không?",
            "Không. Công cụ chỉ gỡ mật khẩu khi bạn nhập đúng mật khẩu hiện tại của file.",
          ],
          PASSWORD_FAQ,
        ],
      },
      {
        slug: "ocr-pdf",
        name: "OCR PDF",
        icon: "OCR",
        job: "ocr-pdf",
        desc: "Nhận dạng chữ trong PDF scan để tìm kiếm và sao chép được.",
        faq: [
          [
            "OCR là gì?",
            "Là nhận dạng chữ trong ảnh. Bản scan chỉ là ảnh chụp trang giấy; sau khi OCR, bạn tìm kiếm và sao chép được chữ.",
          ],
          ["Có nhận dạng tiếng Việt không?", "Có. Công cụ nhận dạng tiếng Việt có dấu và tiếng Anh."],
        ],
      },
      {
        slug: "them-watermark-pdf",
        name: "Thêm watermark",
        icon: "WM",
        job: "watermark-pdf",
        desc: "Chèn chữ chìm lên các trang PDF.",
      },
      {
        slug: "danh-so-trang-pdf",
        name: "Đánh số trang",
        icon: "123",
        job: "page-numbers-pdf",
        desc: "Thêm số trang vào file PDF.",
      },
    ],
  },
  {
    id: "sang-pdf",
    name: "Chuyển sang PDF",
    tools: [
      {
        slug: "word-sang-pdf",
        name: "Word sang PDF",
        icon: "DOC",
        job: "word-to-pdf",
        desc: "Chuyển file Word (.doc, .docx), RTF, văn bản thường sang PDF.",
      },
      {
        slug: "excel-sang-pdf",
        name: "Excel sang PDF",
        icon: "XLS",
        job: "excel-to-pdf",
        desc: "Chuyển bảng tính Excel, CSV sang PDF.",
        faq: [
          [
            "Vì sao chữ trong ô bị cắt?",
            "PDF in đúng như bảng tính hiện ra. Cột hẹp mà ô bên cạnh có dữ liệu thì phần chữ tràn bị che, giống khi in từ Excel. Hãy nới rộng cột trước khi chuyển.",
          ],
        ],
      },
      {
        slug: "powerpoint-sang-pdf",
        name: "PowerPoint sang PDF",
        icon: "PPT",
        job: "powerpoint-to-pdf",
        desc: "Chuyển bài trình chiếu sang PDF, mỗi slide một trang.",
      },
      {
        slug: "anh-sang-pdf",
        name: "Ảnh sang PDF",
        icon: "JPG",
        job: "image-to-pdf",
        desc: "Chuyển ảnh JPG, PNG, HEIC (iPhone)... sang PDF khổ A4.",
      },
      {
        slug: "html-sang-pdf",
        name: "HTML sang PDF",
        icon: "HTML",
        job: "html-to-pdf",
        desc: "Chuyển trang HTML sang PDF bằng trình duyệt Chromium.",
      },
      {
        slug: "markdown-sang-pdf",
        name: "Markdown sang PDF",
        icon: "MD",
        job: "markdown-to-pdf",
        desc: "Chuyển file Markdown (.md) sang PDF.",
      },
      {
        slug: "ebook-sang-pdf",
        name: "Ebook sang PDF",
        icon: "EPUB",
        job: "ebook-to-pdf",
        desc: "Chuyển sách điện tử EPUB, MOBI, AZW3, FB2 sang PDF.",
      },
      {
        slug: "email-sang-pdf",
        name: "Email sang PDF",
        icon: "EML",
        job: "email-to-pdf",
        desc: "Chuyển email (.eml, .msg) sang PDF để lưu trữ.",
      },
      {
        slug: "truyen-tranh-sang-pdf",
        name: "Truyện tranh sang PDF",
        icon: "CBZ",
        job: "comic-to-pdf",
        desc: "Chuyển truyện tranh CBZ sang PDF.",
      },
      {
        slug: "svg-sang-pdf",
        name: "SVG sang PDF",
        icon: "SVG",
        job: "svg-to-pdf",
        desc: "Chuyển ảnh vector SVG sang PDF.",
      },
      {
        slug: "postscript-sang-pdf",
        name: "PostScript sang PDF",
        icon: "EPS",
        job: "postscript-to-pdf",
        desc: "Chuyển file PS, EPS sang PDF.",
      },
      {
        slug: "xps-sang-pdf",
        name: "XPS sang PDF",
        icon: "XPS",
        job: "xps-to-pdf",
        desc: "Chuyển file XPS, OXPS (in ra từ Windows) sang PDF.",
      },
      {
        slug: "djvu-sang-pdf",
        name: "DjVu sang PDF",
        icon: "DJVU",
        job: "djvu-to-pdf",
        desc: "Chuyển sách scan DjVu sang PDF.",
      },
      {
        slug: "dxf-sang-pdf",
        name: "DXF sang PDF",
        icon: "DXF",
        job: "dxf-to-pdf",
        desc: "Chuyển bản vẽ CAD dạng DXF sang PDF.",
        faq: [
          [
            "File DWG có dùng được không?",
            "Không. Hãy xuất bản vẽ ra DXF từ AutoCAD (Save As > DXF) rồi dùng công cụ này.",
          ],
        ],
      },
    ],
  },
  {
    id: "tu-pdf",
    name: "Chuyển từ PDF",
    tools: [
      {
        slug: "pdf-sang-word",
        name: "PDF sang Word",
        icon: "DOC",
        job: "pdf-to-word",
        desc: "Chuyển PDF thành file Word sửa được.",
        faq: [
          [
            "File Word có giống hệt PDF không?",
            "Chữ được giữ đúng, nhưng bố cục phức tạp (nhiều cột, bảng lồng, hình nền) có thể bị lệch.",
          ],
          ["PDF scan có chuyển được không?", "PDF scan chỉ là ảnh, hãy chạy OCR PDF trước rồi mới chuyển sang Word."],
        ],
      },
      {
        slug: "pdf-sang-excel",
        name: "PDF sang Excel",
        icon: "XLS",
        job: "pdf-to-excel",
        desc: "Lấy bảng trong PDF ra file Excel.",
      },
      {
        slug: "pdf-sang-powerpoint",
        name: "PDF sang PowerPoint",
        icon: "PPT",
        job: "pdf-to-powerpoint",
        desc: "Chuyển PDF thành bài trình chiếu.",
      },
      {
        slug: "pdf-sang-jpg",
        name: "PDF sang JPG",
        icon: "JPG",
        job: "pdf-to-jpg",
        desc: "Chuyển mỗi trang PDF thành một ảnh JPG.",
        faq: [ZIP_FAQ],
      },
      {
        slug: "pdf-sang-png",
        name: "PDF sang PNG",
        icon: "PNG",
        job: "pdf-to-png",
        desc: "Chuyển mỗi trang PDF thành một ảnh PNG.",
        faq: [ZIP_FAQ],
      },
      {
        slug: "pdf-sang-text",
        name: "PDF sang Text",
        icon: "TXT",
        job: "pdf-to-text",
        desc: "Lấy toàn bộ chữ trong PDF ra file văn bản.",
      },
      {
        slug: "pdf-sang-epub",
        name: "PDF sang EPUB",
        icon: "EPUB",
        job: "pdf-to-epub",
        desc: "Chuyển PDF thành sách điện tử.",
      },
    ],
  },
  {
    id: "anh",
    name: "Ảnh",
    tools: [
      {
        slug: "nen-anh",
        name: "Nén ảnh",
        icon: "NÉN",
        job: "compress-image",
        desc: "Giảm dung lượng ảnh JPG, PNG, WebP, HEIC mà vẫn rõ nét.",
      },
      {
        slug: "doi-dinh-dang-anh",
        name: "Đổi định dạng ảnh",
        icon: "IMG",
        job: "convert-image",
        desc: "Đổi giữa HEIC, AVIF, JPG, PNG, WebP, PDF.",
      },
      {
        slug: "gop-anh",
        name: "Gộp ảnh",
        icon: "GỘP",
        client: "mergeImages",
        desc: "Ghép nhiều ảnh thành một ảnh dọc hoặc ngang.",
        faq: [BROWSER_FAQ],
      },
      {
        slug: "lam-net-anh",
        name: "Làm nét ảnh",
        icon: "AI",
        job: "enhance-image",
        desc: "Phóng to 2 hoặc 4 lần và làm nét ảnh bằng AI.",
        faq: [AI_FAQ],
      },
      {
        slug: "tao-ma-qr",
        name: "Tạo mã QR",
        icon: "QR",
        client: "qr",
        desc: "Tạo mã QR từ đường link hoặc nội dung bất kỳ.",
        faq: [BROWSER_FAQ],
      },
      {
        slug: "anh-sang-chu",
        name: "Ảnh sang chữ",
        icon: "OCR",
        job: "image-to-text",
        desc: "Nhận dạng chữ tiếng Việt, tiếng Anh trong ảnh chụp, ảnh scan.",
        faq: [
          [
            "Ảnh thế nào thì nhận dạng tốt?",
            "Ảnh rõ nét, chụp thẳng, đủ sáng, chữ không quá nhỏ. Chữ viết tay thường nhận dạng kém.",
          ],
        ],
      },
    ],
  },
  {
    id: "am-thanh-video",
    name: "Âm thanh & video",
    tools: [
      {
        slug: "chep-loi-am-thanh",
        name: "Âm thanh sang chữ",
        icon: "MP3",
        job: "transcribe-audio",
        desc: "Chép lời file ghi âm thành văn bản hoặc phụ đề.",
        faq: [AI_FAQ],
      },
      {
        slug: "chep-loi-video",
        name: "Video sang chữ",
        icon: "MP4",
        job: "transcribe-video",
        desc: "Chép lời video thành văn bản hoặc phụ đề .srt.",
        faq: [AI_FAQ],
      },
      {
        slug: "tach-giong-hat",
        name: "Tách giọng hát",
        icon: "VOX",
        job: "vocal-remove",
        desc: "Tách lời hát và nhạc nền (karaoke) ra riêng.",
        faq: [AI_FAQ],
      },
      {
        slug: "loc-tap-am",
        name: "Lọc tạp âm",
        icon: "DN",
        job: "noise-remove",
        desc: "Xoá tiếng ồn nền trong file ghi âm.",
        faq: [AI_FAQ],
      },
      {
        slug: "cat-video",
        name: "Cắt video",
        icon: "CẮT",
        client: "trimVideo",
        desc: "Xem video, chọn đoạn cần giữ rồi cắt.",
      },
      {
        slug: "nen-video",
        name: "Nén video",
        icon: "NÉN",
        job: "compress-video",
        desc: "Giảm dung lượng video để gửi qua Zalo, email.",
      },
      {
        slug: "doi-dinh-dang-video",
        name: "Đổi định dạng video",
        icon: "MOV",
        job: "convert-video",
        desc: "Đổi giữa MP4, MOV, MKV, AVI, WebM.",
      },
      {
        slug: "doi-dinh-dang-am-thanh",
        name: "Đổi định dạng âm thanh",
        icon: "WAV",
        job: "convert-audio",
        desc: "Đổi giữa MP3, WAV, M4A, FLAC, OGG.",
      },
      {
        slug: "video-sang-mp3",
        name: "Video sang MP3",
        icon: "MP3",
        job: "video-to-mp3",
        desc: "Lấy phần âm thanh của video ra file MP3.",
      },
      {
        slug: "van-ban-sang-giong-noi",
        name: "Văn bản sang giọng nói",
        icon: "TTS",
        job: "text-to-speech",
        desc: "Đọc văn bản tiếng Việt bằng giọng tự nhiên, tải về MP3.",
        faq: [AI_FAQ],
      },
    ],
  },
];
