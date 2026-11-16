# CLAUDE.md: bối cảnh dự án extention_tools

File này tóm tắt những gì đã thống nhất trong buổi trao đổi trên Claude chat (15/11/2026),
để Claude Code nắm được bối cảnh khi mở phiên mới.

## Cách làm việc với người dùng

- Trả lời bằng tiếng Việt.
- Người dùng là người mới: giải thích chậm, mỗi lần một ý, định nghĩa thuật ngữ khi dùng.
- Luôn đưa phiên bản đơn giản nhất trước; để các vấn đề nâng cao lại cho tới khi thật sự cần.
- Nói thẳng khi không chắc chắn hoặc có giới hạn, không tô vẽ.
- Người dùng đang học .NET (đang dùng .NET 10).

## Mục tiêu dự án

Xây một dịch vụ kiểu pdfguru.com cho thị trường Việt Nam: một website gồm nhiều công cụ
xử lý file (PDF, video, âm thanh, phiên âm, hình ảnh). Phần xử lý chạy hoàn toàn trên
máy local của người dùng, dùng các công cụ mã nguồn mở.

Nghiên cứu thị trường: chưa có bên Việt Nam nào làm trọn bộ như vậy. Thị trường đang
do công cụ nước ngoài chiếm (iLovePDF, Smallpdf, PDF24...). Bên Việt chỉ mạnh từng mảng
(FPT.AI, Viettel AI, Vbee cho giọng nói; VNPT/Viettel/FPT cho OCR doanh nghiệp).

## Kiến trúc đã chọn: worker tự đi hỏi job (polling)

1. Website + API (trên internet): người dùng tải file lên, API lưu file và tạo dòng trong
   bảng Jobs (Id, Type, Status, InputFile, OutputFile).
   Trạng thái: Pending -> Processing -> Done / Failed.
2. Worker (chạy ở máy local) cứ khoảng 3 giây gọi `GET /api/jobs/next`
   (kèm header X-Worker-Key):
   - 204 = không có job, đợi rồi hỏi lại.
   - 200 = trả về job; API đồng thời đổi job sang Processing để không bị nhận hai lần.
3. Worker tải file, chọn công cụ theo loại job (mỗi loại một handler), chạy xong thì
   `POST /api/jobs/{id}/complete` kèm file kết quả.

Lý do chọn polling: máy nhà không có IP cố định, không phải mở cổng router; máy tắt thì
job vẫn nằm chờ. Đẩy job tức thời (SignalR) để sau.

Bản đầu: worker chạy 1 job một lúc; dùng bảng Jobs trong database làm hàng đợi
(chưa cần RabbitMQ/Redis). Để sau: chia làn nhẹ/nặng, retry, xử lý job bị kẹt, báo tiến độ realtime.

Mọi công cụ quy về 2 kiểu: gọi HTTP (dịch vụ chạy trong Docker) hoặc chạy lệnh (FFmpeg...).

## Ngôn ngữ backend (đã chốt 16/11/2026)

API viết bằng .NET (ASP.NET Core minimal API, .NET 10), Worker viết bằng Python.
Lý do: người dùng đang học .NET; worker Python gọi thẳng được các mô hình AI.

- api/: minimal API, EF Core + SQLite (file api/data/jobs.db, tạo bằng EnsureCreated,
  chưa dùng migration). File lưu ở api/data/files, đặt tên theo Id job.
  Id job là Guid để người khác không đoán được. Upload đọc bằng request.ReadFormAsync.
  Cổng 5100. WorkerKey lấy từ cấu hình (bản dev: "dev-worker-key").
- worker/: main.py (vòng lặp polling), handlers/ (mỗi loại job một file, đăng ký trong
  handlers/__init__.py). Mỗi handler nhận (input_path, work_dir), trả về đường dẫn file kết quả.
- Loại job hiện có (12): "word-to-pdf" (+ .txt), "excel-to-pdf" (+ .csv), "powerpoint-to-pdf"
  (cả ba dùng chung office_to_pdf.py, gọi Gotenberg /forms/libreoffice/convert; LibreOffice tự
  nhận loại file theo đuôi); "html-to-pdf" (html_to_pdf.py, Gotenberg /forms/chromium/convert/html,
  file phải tên index.html; ảnh/CSS file riêng không đi kèm);
  qua Stirling (stirling_to_pdf.py, mỗi hàm một handler, đều gọi stirling.post):
  "image-to-pdf" (/convert/img/pdf, fitOption=maintainAspectRatio, autoRotate=true),
  "markdown-to-pdf", "ebook-to-pdf" (Calibre có sẵn trong image Stirling), "email-to-pdf"
  (/convert/eml/pdf), "comic-to-pdf" (/convert/cbz/pdf), "svg-to-pdf", "postscript-to-pdf"
  (/convert/vector/pdf, Ghostscript);
- handlers/stirling.py: hàm post(endpoint, input_path, work_dir, data) dùng chung, gửi trường
  fileInput, xử lý 401, báo lỗi nếu kết quả không bắt đầu bằng %PDF;
  "compress-pdf" (gọi Stirling POST /api/v1/misc/compress-pdf, trường fileInput,
  optimizeLevel theo tuỳ chọn "level"; nếu kết quả không nhỏ hơn thì trả lại file gốc).
- Tuỳ chọn job: mỗi loại job khai báo danh sách JobOption (Name, Label, Default, Choices)
  trong jobTypes. API đọc giá trị từ form, không gửi thì dùng Default, sai thì 400; lưu vào
  cột Jobs.Options (chuỗi JSON). /next trả "options" cho worker; handler nhận
  (input_path, work_dir, options). Trang web tự vẽ nút tròn cho từng tuỳ chọn.
- Mức nén cho người dùng chọn: 4 Nhẹ, 5 Vừa (mặc định), 8 Mạnh. Đo trên PDF 5,8MB có ảnh
  1600x1200: mức 1-3 gần như không giảm (~5,7MB); 4: 528KB (ảnh 1248px); 5: 340KB (1088px);
  6-7: 672KB (to hơn mức 5); 8: 167KB (756px); 9: 67KB (533px, quá mờ).
- EnsureCreated không thêm cột vào database cũ: đổi entity Job thì phải xoá api/data/jobs.db
  (chỉ khi phát triển). Trước khi có dữ liệu thật nên chuyển sang EF Core migrations.
  Danh sách loại job (tên hiển thị + đuôi file) khai báo trong biến jobTypes ở api/Program.cs;
  thêm handler mới ở worker thì thêm một dòng ở đó, trang web tự hiện công cụ mới.
- Trang web: api/wwwroot/index.html, HTML + JS thuần (chưa dùng framework), API phục vụ
  luôn qua UseDefaultFiles/UseStaticFiles. Trang gọi GET /api/job-types để hiện công cụ,
  kiểm tra đuôi file trên trình duyệt, POST /api/jobs, rồi hỏi trạng thái mỗi 2 giây.
  Chờ Pending quá 15 giây thì báo "máy xử lý đang bận hoặc đang tắt".

## Hai máy

- Máy cá nhân (đang dùng): để phát triển và chạy thử. GPU: NVIDIA GTX 1650 4GB
  (driver 512.78), đủ thử Whisper bản nhỏ, không chạy được mô hình AI nặng.
- Máy chạy thật: Intel Core Ultra 5 245K, RAM 64GB, NVIDIA RTX 5060 Ti 16GB, ổ cứng ~11TB, Windows.

Cách chuyển giữa 2 máy: code và file cấu hình đi qua Git (repo private
github.com/Stung16/extention_tools); phần mềm do Docker tự tải trên mỗi máy;
dữ liệu và model không đưa lên Git (xem .gitignore).
Cả 2 máy cần: Git, Docker Desktop (WSL2). Máy GPU: driver NVIDIA cài trên Windows,
không cài driver bên trong WSL.

## Công cụ đã chọn cho từng việc

- PDF (sửa, gộp, tách, nén, OCR, ký, chuyển đổi): Stirling-PDF (Docker, cổng 8080)
- Word/Excel/PPTX/HTML sang PDF: Gotenberg (Docker, cổng 3000)
- OCR tiếng Việt chính xác hơn: OCRmyPDF + Tesseract (gói vie), VietOCR/PaddleOCR
- EPUB: Calibre (ebook-convert)
- Dịch PDF giữ bố cục: PDFMathTranslate-next (BabelDOC) + Ollama
- Video/âm thanh: FFmpeg
- Âm thanh/video thành văn bản: faster-whisper + PhoWhisper (VinAI); YouTube: yt-dlp
- Văn bản thành giọng nói tiếng Việt: VieNeu-TTS
- Tách giọng hát: Demucs (dùng fork adefossez/demucs; repo gốc của Meta đã lưu trữ)
- Nhạc AI: ACE-Step 1.5 (16GB: dùng chế độ low-memory)
- Video AI: Wan 2.2 qua ComfyUI (16GB: bản 14B GGUF Q8/FP8, chậm, khoảng 10 phút trở lên mỗi clip)
- Làm nét ảnh: Real-ESRGAN; nén/gộp ảnh: libvips hoặc ImageMagick

## Lưu ý quan trọng

- RTX 50 (Blackwell, sm_120) cần PyTorch >= 2.7 bản CUDA 12.8 trở lên. Image Docker cũ
  sẽ báo lỗi "sm_120 is not compatible" hoặc lặng lẽ chạy bằng CPU.
- 16GB VRAM: việc nhẹ (Whisper, TTS, Real-ESRGAN) chạy song song được; việc nặng
  (video AI, nhạc AI, Ollama) chạy từng việc một.
- Giấy phép: VieNeu-TTS bản 0.3B là CC BY-NC (không dùng thương mại), bản 0.5B là Apache 2.0;
  PDFMathTranslate là AGPL-3.0; Stirling-PDF có một số tính năng độc quyền;
  ACE-Step (MIT) và Wan 2.2 (Apache 2.0) dùng thương mại được.
- Mạng gia đình: tốc độ upload thấp, file video lớn có thể tải lên/xuống lâu.
- Stirling-PDF (bản 3.3.0) mặc định bật đăng nhập; API khi đó đòi header X-API-KEY (key riêng
  của từng tài khoản). Bản này không còn cấu hình key chung (customGlobalAPIKey) như bản cũ.
  Đã chọn tắt đăng nhập bằng biến môi trường SECURITY_ENABLELOGIN=false trong
  docker-compose.yml (an toàn vì chỉ mở trên 127.0.0.1). Nếu mở Stirling ra mạng thì phải
  bật lại và đặt STIRLING_API_KEY cho worker (handler đã hỗ trợ sẵn).
- Tài liệu API của Stirling: http://localhost:8080/v1/api-docs (JSON; /v3/api-docs trả về HTML).
- Image Stirling-PDF lấy từ docker.stirlingpdf.com, tải lần đầu khá chậm (hơn 10 phút).
- Các công cụ AI sau này thêm vào docker-compose.yml với `profiles: [gpu]` để máy không có GPU vẫn chạy phần còn lại.

## Trạng thái hiện tại

- Repo có: docker-compose.yml (Stirling-PDF + Gotenberg, chỉ mở trên 127.0.0.1),
  .gitignore, README.md, CLAUDE.md.
- Đã push lên GitHub.
- Máy cá nhân (16/11/2026): `docker compose up -d` chạy được. Stirling-PDF trả 200 ở
  :8080 (chuyển sang /login). Gotenberg /health báo chromium + libreoffice "up", đã đổi
  thử HTML tiếng Việt sang PDF thành công.
- Khung API + Worker đã chạy thử trọn luồng (16/11/2026): file .docx tiếng Việt thành PDF
  đúng chữ; sai key bị 401; hàng đợi trống trả 204; sai đuôi file bị 400; Gotenberg không
  gọi được thì job thành Failed kèm lý do.
- Trang web upload đã chạy thử trên trình duyệt (16/11/2026): chặn sai đuôi file, Word
  thành PDF, tên file tiếng Việt giữ đúng khi tải về, giao diện điện thoại không tràn ngang;
  tắt worker thì job nằm chờ, bật lại thì tự xử lý và trang tự chuyển sang "Xong!".
- Handler nén PDF đã chạy thử (16/11/2026): PDF 5,8MB còn 340KB qua API + worker, chữ tiếng
  Việt giữ nguyên; nhánh "kết quả to hơn thì trả file gốc" và nhánh 401 thử bằng giả lập.
- Tuỳ chọn mức nén đã chạy thử (16/11/2026): cả 3 mức qua API ra đúng dung lượng; không gửi
  thì dùng 5; gửi 9 bị 400; trên trang web chọn "Mạnh" thì job nhận level 8, file 167KB;
  chuyển sang "Word sang PDF" thì ô tuỳ chọn biến mất.
- Excel/PowerPoint sang PDF đã chạy thử (16/11/2026) với file .xlsx/.pptx tiếng Việt tạo bằng
  openpyxl/python-pptx: chữ đúng, công thức =SUM được tính, mỗi slide một trang, gửi .pptx
  vào excel-to-pdf bị 400.
- 12 công cụ đổi sang PDF đã chạy thử trọn luồng (16/11/2026) bằng file mẫu tự tạo: .txt, .csv,
  .jpg, .png, .webp, .html, .md, .epub, .fb2, .eml, .cbz, .svg, .eps, .pptx; chữ tiếng Việt đúng
  (SVG và ảnh xem bằng mắt qua Stirling /convert/pdf/img). Chưa thử bằng file thật: .mobi,
  .azw3, .msg, .gif, .tif, .ps, .doc/.xls/.ppt đời cũ.
- Không thêm CBR (truyện tranh nén RAR): image Stirling không có unrar/7z, chưa thử được.
  Chưa thêm "URL sang PDF" vì cần ô nhập địa chỉ thay cho ô tải file.
- Lưu ý Excel sang PDF in đúng như bảng tính hiện ra: cột hẹp mà ô bên cạnh có dữ liệu thì
  chữ tràn bị cắt (ví dụ "Cà phê sữa đá" thành "Cà phê sữa"). Excel cũng in như vậy.
  Bảng rộng có thể bị chia ra nhiều trang. Nếu cần, Gotenberg có tuỳ chọn như
  singlePageSheets/landscape (chưa dùng).
- Lưu ý: LibreOffice dễ tính, file .docx hỏng vẫn được in ra PDF như văn bản thuần
  chứ không báo lỗi.

## Bước tiếp theo

1. Clone sang máy GPU, chạy lại `docker compose up -d`; kiểm tra GPU trong Docker:
   `docker run --rm --gpus all nvidia/cuda:12.9.0-base-ubuntu22.04 nvidia-smi`
2. Thêm handler mới (gộp/tách PDF qua Stirling-PDF; gộp cần nhiều file một job).
3. Chuyển database sang EF Core migrations trước khi có dữ liệu thật.
Để sau: job bị kẹt ở Processing khi worker tắt giữa chừng, retry, xoá file cũ,
giới hạn dung lượng upload (Kestrel mặc định khoảng 30MB), thanh tiến độ khi tải file lên
(trang hiện chỉ báo "Đang tải file lên..."), mở API ra internet (HTTPS, chống lạm dụng).
