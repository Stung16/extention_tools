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

## Quyết định còn mở

Chưa chọn ngôn ngữ backend:
- Toàn bộ .NET (API + Worker Service), hoặc
- Toàn bộ Python (FastAPI + worker Python; gọi thẳng mô hình AI, không cần bọc), hoặc
- API .NET + Worker Python.
Hỏi lại người dùng trước khi viết code backend.

## Hai máy

- Máy cá nhân (đang dùng): để phát triển và chạy thử. Chưa biết có GPU hay không.
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
- Stirling-PDF bản mới có thể bật đăng nhập mặc định; chưa xác minh tài khoản mặc định.
- Các công cụ AI sau này thêm vào docker-compose.yml với `profiles: [gpu]` để máy không có GPU vẫn chạy phần còn lại.

## Trạng thái hiện tại

- Repo có: docker-compose.yml (Stirling-PDF + Gotenberg, chỉ mở trên 127.0.0.1),
  .gitignore, README.md, CLAUDE.md.
- Đã git init và commit; remote origin đã đặt. Người dùng tự chạy `git push`
  (môi trường Claude chat không push được).

## Bước tiếp theo

1. Người dùng chạy `docker compose up -d`, kiểm tra http://localhost:8080 và http://localhost:3000/health.
2. Push lên GitHub, clone sang máy GPU, chạy lại; kiểm tra GPU trong Docker:
   `docker run --rm --gpus all nvidia/cuda:12.9.0-base-ubuntu22.04 nvidia-smi`
3. Chốt ngôn ngữ backend, rồi dựng khung: API (endpoint jobs/next, complete, tạo job)
   và Worker, kèm một handler chạy thật (Word sang PDF qua Gotenberg).
