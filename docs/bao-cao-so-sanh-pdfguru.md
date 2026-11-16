# Báo cáo: so sánh với pdfguru.com và kế hoạch bổ sung công cụ

Ngày: 16/11/2026. Người làm: Claude Code, theo yêu cầu "làm theo flow của pdfguru.com".

## 1. Tóm tắt

- pdfguru có khoảng **150 công cụ**, chia thành 7 nhóm: chỉnh sửa và ký PDF, chuyển sang PDF,
  chuyển từ PDF, ảnh, âm thanh/video, AI, biểu mẫu.
- Mình đang có **12 công cụ** (11 công cụ chuyển sang PDF + Nén PDF).
- **Phần lớn công cụ PDF còn thiếu làm được ngay bằng Stirling-PDF đang chạy sẵn**, không phải
  cài thêm gì. Đây là phần nên làm trước vì rẻ nhất.
- Ảnh, âm thanh, video cần thêm FFmpeg và vài thư viện Python. Mảng AI (chép lời, giọng nói,
  tách giọng hát, dịch PDF...) nên chạy trên máy RTX 5060 Ti.
- Khó nhất là nhóm **chỉnh sửa trực tiếp trên trình duyệt** (sửa chữ trong PDF, ghi chú, ký tên,
  điền biểu mẫu, sắp xếp trang bằng kéo thả). Nhóm này cần một trình xem PDF chạy trong trình
  duyệt, không làm theo kiểu "tải lên rồi chờ" như hiện tại.

## 2. Luồng sử dụng của pdfguru

Mỗi công cụ là **một trang riêng** có địa chỉ riêng (ví dụ `pdfguru.com/vi/compress-pdf`). Trang gồm:

1. Tiêu đề lớn ("Nén PDF trực tuyến") và **ô kéo thả file** ngay đầu trang, ghi rõ "Dung lượng tối đa 100 MB".
2. Sau khi tải lên: chọn tuỳ chọn (ví dụ 3 mức nén, có **xem trước dung lượng** từng mức), xử lý, tải về.
3. Phần dưới trang: "Cách dùng" 3 bước, các ưu điểm, đánh giá người dùng, câu hỏi thường gặp (FAQ),
   và **lưới công cụ khác** chia theo nhóm để người dùng đi tiếp.
4. Trang chủ và menu trên cùng chia công cụ theo nhóm: Chỉnh sửa & Ký, Chuyển đổi, Biểu mẫu, AI.

Cách họ kiếm tiền: **tải file đầu tiên miễn phí, từ file sau phải mua gói**. Mỗi công cụ có trang
riêng là để lên Google: người dùng tìm "nén pdf" sẽ vào thẳng trang nén.

**Mình làm theo luồng, không chép thương hiệu:** trang công cụ riêng, ô kéo thả, các bước, FAQ,
lưới công cụ theo nhóm. Không dùng tên, logo, câu chữ hay hình ảnh của họ.

## 3. So sánh từng nhóm

Ký hiệu: ✅ đã có · 🟢 làm được ngay bằng Stirling/Gotenberg đang chạy · 🟡 cần cài thêm công cụ
(không cần GPU) · 🔴 cần GPU (máy RTX) · ⚫ khó, cần làm giao diện chỉnh sửa riêng · ⛔ không nên làm.

### 3.1. Chuyển sang PDF (pdfguru có 24)

| Công cụ | Trạng thái | Dùng gì | Ghi chú |
|---|---|---|---|
| Word, DOCX, RTF, Text | ✅ | Gotenberg | |
| Excel, CSV | ✅ | Gotenberg | |
| PowerPoint | ✅ | Gotenberg | |
| JPG, PNG, WebP, TIFF, ảnh | ✅ | Stirling | |
| HTML | ✅ | Gotenberg (Chromium) | |
| EPUB, MOBI, AZW3 | ✅ | Stirling (Calibre) | MOBI/AZW3 chưa thử bằng file thật |
| SVG, EPS | ✅ | Stirling | |
| HEIC, AVIF (ảnh iPhone, ảnh web mới) | 🟡 | Thư viện Python **Pillow + pillow-heif** trong worker, đổi ra JPG rồi đưa Stirling | HEIC rất quan trọng: người dùng iPhone gặp hằng ngày |
| XPS | 🟡 | **PyMuPDF** (MuPDF) trong worker | Giấy phép AGPL, xem mục 6 |
| DjVu | 🟡 | **DjVuLibre** (lệnh `ddjvu -format=pdf`) | Sách scan cũ hay dùng |
| DWG, DXF (bản vẽ AutoCAD) | 🟡 | **LibreDWG** (`dwg2dxf`) rồi **ezdxf** vẽ ra PDF | Khó vừa, ít người dùng; để cuối |

### 3.2. Chuyển từ PDF (pdfguru có 16)

Tất cả trừ DXF, SVG và MOBI đều có sẵn trong Stirling.

| Công cụ | Trạng thái | Dùng gì | Ghi chú |
|---|---|---|---|
| PDF sang Word/DOCX | 🟢 | Stirling `/convert/pdf/word` | Đã thử: giữ đúng chữ tiếng Việt. Bố cục phức tạp có thể lệch (Stirling dùng LibreOffice). Muốn đẹp hơn: **pdf2docx** (AGPL) |
| PDF sang Excel | 🟢 | Stirling `/convert/pdf/xlsx` | Chỉ tốt với bảng rõ ràng |
| PDF sang PowerPoint | 🟢 | Stirling `/convert/pdf/presentation` | |
| PDF sang JPG/PNG/WebP/TIFF | 🟢 | Stirling `/convert/pdf/img` | Nhiều trang thì trả về file .zip (đã thử) |
| PDF sang EPUB/AZW3 | 🟢 | Stirling `/convert/pdf/epub` | |
| PDF sang HTML, Text | 🟢 | Stirling `/convert/pdf/html`, `/convert/pdf/text` | |
| PDF sang MOBI | 🟡 | **Calibre** `ebook-convert` | Calibre có sẵn trong Stirling nhưng Stirling không mở chức năng này ra API |
| PDF sang SVG | 🟡 | **PyMuPDF** (`page.get_svg_image()`) | AGPL |
| PDF sang DXF | ⛔ | | Rất ít người dùng, công cụ mã nguồn mở kém |

### 3.3. Sắp xếp, bảo mật, OCR (nhóm "Chỉnh sửa & Ký" phần không cần giao diện vẽ)

| Công cụ | Trạng thái | Dùng gì | Ghi chú |
|---|---|---|---|
| Gộp PDF | 🟢 | Stirling `/general/merge-pdfs` | **API cần nhận nhiều file một job** (hiện chỉ 1 file) |
| Tách PDF | 🟢 | Stirling `/general/split-pages` | Kết quả .zip |
| Trích xuất trang | 🟢 | Stirling `/general/rearrange-pages` | Cần ô nhập "trang 1-3, 5" |
| Xoá trang | 🟢 | Stirling `/general/remove-pages` | Cần ô nhập số trang |
| Xoay PDF | 🟢 | Stirling `/general/rotate-pdf` | Tuỳ chọn 90/180/270 độ |
| Đặt mật khẩu | 🟢 | Stirling `/security/add-password` | Cần ô nhập mật khẩu |
| Mở khoá PDF | 🟢 | Stirling `/security/remove-password` | Chỉ khi người dùng biết mật khẩu |
| OCR PDF (nhận dạng chữ trong bản scan) | 🟢 | Stirling `/misc/ocr-pdf` (Tesseract) | **Chưa có gói tiếng Việt**: phải tải `vie.traineddata` vào `data/stirling/tessdata`. Muốn chính xác hơn: **OCRmyPDF**, **VietOCR**, **PaddleOCR** |
| Ảnh sang chữ | 🟢 | Tesseract (qua Stirling OCR) | Cùng điều kiện gói tiếng Việt |
| Thêm watermark, đánh số trang | 🟢 | Stirling `/security/add-watermark`, `/misc/add-page-numbers` | pdfguru không có, mình có thêm được |
| Cắt lề (Crop) | ⚫ | Stirling `/general/crop` | Cần giao diện kéo khung trên trang |
| Sắp xếp trang (Organize) | ⚫ | Vẽ ảnh nhỏ các trang (PDF.js) + Stirling `/general/rearrange-pages` | Cần giao diện kéo thả |
| Tạo PDF | ✅ | | Chính là các công cụ "sang PDF" |
| Xoá watermark | ⛔ | | Không có công cụ mã nguồn mở tốt; dễ bị dùng để gỡ bản quyền người khác |

### 3.4. Chỉnh sửa trực tiếp trên trình duyệt

| Công cụ | Trạng thái | Dùng gì | Ghi chú |
|---|---|---|---|
| Ghi chú (Annotate), Ký tên, Điền biểu mẫu | ⚫ | **EmbedPDF** (trình xem PDF chạy bằng PDFium trong trình duyệt) hoặc **PDF.js** của Mozilla (Apache-2.0, có sẵn công cụ viết, vẽ, chèn ảnh) | Chạy hẳn trên máy người dùng, không cần worker |
| Sửa chữ trong PDF (Edit PDF) | ⚫ | Chưa có lựa chọn mã nguồn mở thật tốt. EmbedPDF đang làm tính năng sửa chữ trực tiếp | Để sau cùng |

### 3.5. Ảnh

| Công cụ | Trạng thái | Dùng gì |
|---|---|---|
| Đổi định dạng ảnh (HEIC, AVIF, GIF, JPG, PNG, WebP) | 🟡 | **Pillow + pillow-heif** trong worker. SVG sang JPG: **resvg** hoặc CairoSVG |
| Nén ảnh | 🟡 | **Pillow** (JPG/WebP), có thể thêm mozjpeg/oxipng; hoặc **libvips** |
| Gộp ảnh | 🟡 | **Pillow** (ghép dọc/ngang) |
| Word sang JPG | 🟢 | Gotenberg (Word sang PDF) rồi Stirling (PDF sang ảnh) |
| Tạo mã QR | 🟡 | Thư viện Python **qrcode**, hoặc làm ngay trên trình duyệt bằng JavaScript |
| Làm nét ảnh (Enhance) | 🔴 | **Real-ESRGAN** |

### 3.6. Âm thanh và video

| Công cụ | Trạng thái | Dùng gì |
|---|---|---|
| Đổi định dạng âm thanh/video (MP4, MP3, MOV, MKV, WAV...) | 🟡 | **FFmpeg** |
| Nén video | 🟡 | **FFmpeg** (H.264/H.265; máy RTX dùng NVENC cho nhanh) |
| Chép lời âm thanh/video | 🔴 | **faster-whisper + PhoWhisper** (VinAI, tốt cho tiếng Việt) |
| Chép lời YouTube | 🔴 | **yt-dlp** tải về rồi chép lời như trên |
| Lọc tạp âm | 🟡/🔴 | **DeepFilterNet** (MIT/Apache), chạy được cả trên CPU |
| Tách giọng hát | 🔴 | **Demucs** (fork adefossez/demucs) |
| Văn bản thành giọng nói | 🔴 | **VieNeu-TTS** bản 0.5B (Apache-2.0; bản 0.3B cấm thương mại) |
| Tạo nhạc AI | 🔴 | **ACE-Step 1.5** (chế độ ít bộ nhớ) |
| Trình sửa video | ⚫ | Cần giao diện riêng. Bản đơn giản: cắt đoạn bằng FFmpeg với ô nhập giờ bắt đầu/kết thúc |

### 3.7. AI

| Công cụ | Trạng thái | Dùng gì |
|---|---|---|
| Dịch PDF giữ bố cục | 🔴 | **PDFMathTranslate-next (BabelDOC) + Ollama** (AGPL) |
| Tóm tắt PDF, tóm tắt sách | 🔴 | Stirling `/convert/pdf/text` lấy chữ ra, rồi **Ollama** với mô hình như Qwen hoặc Gemma tóm tắt |
| Dịch văn bản | 🔴 | **Ollama** |

### 3.8. Biểu mẫu và mẫu PDF

pdfguru có các mẫu thuế của Mỹ (W-9, 1040...). ⛔ Không phù hợp Việt Nam. Sau này có thể làm
mẫu riêng cho Việt Nam (đơn xin việc, hợp đồng thuê nhà, giấy uỷ quyền...).

## 4. Đề xuất thứ tự làm

**Cập nhật 16/11/2026: Giai đoạn 1 đã xong** (16 công cụ: PDF sang Word/Excel/PowerPoint/JPG/PNG/
Text/HTML/EPUB, xoay, xoá trang, trích xuất trang, đặt/gỡ mật khẩu, watermark, đánh số trang,
OCR tiếng Việt). Trang web hiện có 28 công cụ dùng được.

**Cập nhật lần 2 (16/11/2026): làm xong giai đoạn 2, 3, 4, 6 và phần lớn giai đoạn 5.** Trang web
viết lại bằng React, có **54 công cụ dùng được**:

- Chạy trên trình duyệt (React + pdf.js + pdf-lib): Sửa PDF, Ký PDF, Ghi chú PDF, Điền biểu mẫu, Gộp,
  Tách, Sắp xếp trang, Cắt lề PDF, Tạo mã QR, Gộp ảnh.
- Worker thường: Nén ảnh, Đổi định dạng ảnh (có HEIC/AVIF), HEIC sang PDF, Nén video, Đổi định dạng
  video/âm thanh, Video sang MP3, Cắt video (chọn đoạn trên trình duyệt).
- Worker AI (đã thử trên CPU, chờ thử trên GPU): Chép lời âm thanh/video (faster-whisper), Chép lời
  YouTube (yt-dlp, cần cookies khi YouTube chặn), Lọc tạp âm (DeepFilterNet), Tách giọng hát (Demucs),
  Làm nét ảnh (Real-ESRGAN), Tóm tắt tài liệu, Dịch tài liệu (Ollama + Qwen2.5).
- Còn "Sắp có": Văn bản sang giọng nói, Tạo nhạc AI, Dịch PDF giữ bố cục, XPS/DjVu/DWG sang PDF, Ảnh sang chữ.

**Cập nhật lần 3 (16/11/2026 tối): thêm 7 công cụ, trang web có 61 công cụ dùng được.** Ảnh sang chữ
(Tesseract qua Stirling), XPS sang PDF (libgxps), DjVu sang PDF (DjVuLibre), DXF sang PDF (ezdxf),
Văn bản sang giọng nói (VieNeu-TTS, chạy CPU), Dịch PDF giữ bố cục (PDFMathTranslate-next + Ollama),
Tạo nhạc AI (ACE-Step 1.5 qua REST, chưa chạy thử thật). Chỉ còn "Sắp có": DWG sang PDF (chưa có công cụ
mã nguồn mở cài đặt dễ; tạm thời hướng dẫn người dùng xuất DXF).

| Giai đoạn | Nội dung | Cần cài thêm |
|---|---|---|
| **1** (nên làm ngay) | Giao diện mới theo luồng pdfguru; PDF sang Word/Excel/PowerPoint/ảnh/Text/HTML/EPUB; xoay; đặt/gỡ mật khẩu; xoá/trích xuất trang; thêm watermark, số trang; OCR tiếng Việt | Không (chỉ tải gói `vie.traineddata`) |
| **2** | Gộp PDF, tách PDF (API nhận nhiều file, trả .zip) | Không |
| **3** | HEIC/AVIF sang PDF/JPG, đổi định dạng ảnh, nén ảnh, gộp ảnh, QR, Word sang JPG | Pillow, pillow-heif, qrcode (thư viện Python) |
| **4** | Âm thanh/video: đổi định dạng, nén video, cắt video | FFmpeg |
| **5** (máy RTX) | Chép lời, YouTube, giọng nói, tách giọng, lọc tạp âm, làm nét ảnh, dịch PDF, tóm tắt | Docker có GPU (`profiles: [gpu]`) |
| **6** | Ghi chú, ký, điền biểu mẫu, sắp xếp trang, cắt lề trên trình duyệt | EmbedPDF hoặc PDF.js |
| Để sau | XPS, DjVu, DWG/DXF, PDF sang MOBI/SVG | PyMuPDF, DjVuLibre, LibreDWG |

## 5. Những việc cần làm thêm để giống luồng của họ

- **Giới hạn file 100 MB**: hiện API giới hạn khoảng 30 MB.
- **Thanh tiến độ khi tải lên**: mạng chậm thì rất cần.
- **Nhiều file một job** (gộp PDF, ảnh sang PDF nhiều ảnh) và **kết quả .zip** (tách PDF, PDF sang ảnh).
- **Ô nhập chữ** cho tuỳ chọn (số trang, mật khẩu, chữ watermark): hiện tuỳ chọn chỉ có dạng chọn.
- **Xem trước dung lượng** khi nén (họ có): phải nén thử cả 3 mức rồi mới cho chọn.
- **Đăng nhập, gói trả phí, giới hạn miễn phí**: chưa làm; cần khi mở ra internet.

## 6. Lưu ý giấy phép

- **AGPL** (PyMuPDF/MuPDF, pdf2docx, PDFMathTranslate, Ghostscript): nếu sửa mã của các công cụ này
  rồi cho người khác dùng qua mạng, phải công bố mã đã sửa. Gọi chúng như một chương trình riêng
  (không sửa) thì rủi ro thấp hơn, nhưng nên hỏi người hiểu luật trước khi kinh doanh.
- Stirling-PDF: phần lõi mã nguồn mở, một số tính năng là bản độc quyền (proprietary).
- VieNeu-TTS: chỉ bản 0.5B được dùng thương mại.

## 7. Điều chưa chắc chắn

- Danh sách công cụ pdfguru lấy từ trang chủ ngày 16/11/2026; họ có thể thêm bớt.
- Chưa tải file lên pdfguru để thử, nên phần "sau khi tải lên" (chọn tuỳ chọn, trả phí) dựa trên
  chữ hướng dẫn trên trang của họ.
- EmbedPDF: các nguồn ghi giấy phép khác nhau (MIT hoặc Apache-2.0), phải xem file LICENSE trên GitHub.
- DeepFilterNet: giấy phép kép MIT/Apache theo PyPI; nên xem lại trên GitHub.

## Nguồn tham khảo

- pdfguru.com (trang chủ và trang /vi/compress-pdf), xem ngày 16/11/2026
- Tài liệu API Stirling-PDF trên máy: http://localhost:8080/v1/api-docs
- [Nutrient: PDF-to-Word conversion guide](https://www.nutrient.io/blog/convert-pdf-to-word/) (pdf2docx, AGPL)
- [EmbedPDF](https://embedpdf.com), [EmbedPDF docs](https://embedpdf.com/docs), [EmbedPDF editor](https://www.embedpdf.com/editor)
- [DeepFilterNet trên PyPI (libraries.io)](https://libraries.io/pypi/deepfilternet)
- [LibreDWG dwg2dxf](https://manpages.opensuse.org/Tumbleweed/libredwg-tools/dwg2dxf.1.en.html), [ezdxf ODA add-on](https://ezdxf.readthedocs.io/en/stable/addons/odafc.html)
- [libheif README](https://github.com/strukturag/libheif/blob/master/README.md), [PhotoPrism HEIF guide](https://docs.photoprism.app/developer-guide/media/heif/)
- [mutool convert](https://sources.debian.org/data/main/m/mupdf/1.17.0%2Bds1-2/docs/manual-mutool-convert.html), [DjVu sang PDF bằng ddjvu (Baeldung)](https://www.baeldung.com/linux/djvu-pdf-cli-conversion)
