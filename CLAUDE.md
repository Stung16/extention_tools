# CLAUDE.md: bối cảnh dự án extention_tools

Tóm tắt những gì đã thống nhất và đã làm, để Claude Code nắm bối cảnh khi mở phiên mới.

## Cách làm việc với người dùng

- Trả lời bằng tiếng Việt.
- Người dùng là người mới: giải thích chậm, mỗi lần một ý, định nghĩa thuật ngữ khi dùng.
- Luôn đưa phiên bản đơn giản nhất trước; để các vấn đề nâng cao lại cho tới khi thật sự cần.
- Nói thẳng khi không chắc chắn hoặc có giới hạn, không tô vẽ.
- Người dùng đang học .NET (đang dùng .NET 10).
- Người dùng muốn: làm được gì trên máy cá nhân thì làm và test trước, phần cần GPU để họ test trên
  máy RTX; công cụ cần thao tác thì chạy trên trình duyệt (React); tự chọn repo/thư viện phù hợp.

## Mục tiêu dự án

Website kiểu pdfguru.com cho thị trường Việt Nam: nhiều công cụ xử lý file (PDF, ảnh, video, âm thanh,
AI). Xử lý chạy trên máy local bằng phần mềm mã nguồn mở. Làm theo LUỒNG của pdfguru (mỗi công cụ một
trang, ô kéo thả, bước hướng dẫn, FAQ, lưới công cụ theo nhóm), KHÔNG chép thương hiệu/câu chữ của họ.
Tên tạm: "Công Cụ File" (SITE_NAME trong web/src/catalog/categories.js). Báo cáo so sánh: docs/bao-cao-so-sanh-pdfguru.md.

## Kiến trúc

- `web/` React 18 + Vite 5 + react-router 6 (JavaScript, không TypeScript). `npm run build` ->
  `api/src/CongCuFile.Api/wwwroot` (scripts/clean.mjs xoá FILE cũ trước, vì API đang chạy giữ khoá thư mục
  -> EBUSY nếu để Vite xoá thư mục). `npm run dev` ở :5173, proxy /api -> :5100. wwwroot KHÔNG đưa lên Git.
  - Làm lại 17/11/2026 (đợt 3, cùng nguyên tắc backend/worker; hướng dẫn: web/README.md). Cấu trúc src/: app/
    (App, Layout) -> pages/ (HomePage, ToolPage, NotFoundPage, tool-page/toolHelp.js) -> features/ (clientTools.js,
    server-jobs/, pdf/{operations,editor,components}, image/, video/) -> catalog/ (categories.js dữ liệu, faqs.js,
    queries.js, JobTypesContext useJobTypes()) -> api/jobsApi.js (MỌI fetch/XHR); shared/ (components FileDrop,
    PickFilePanel, FileLine, ChoiceGroup, ToolCard/ToolGrid, Messages; hooks useTask, useDocumentTitle; lib files,
    format, search, pointer). Quy tắc phụ thuộc ép bằng ESLint no-restricted-imports (eslint.config.js). Import "@/"
    = src/ (alias trong vite.config.js). Logic thuần (.js, không React) tách khỏi component: operations/*.js nhận
    bytes trả bytes, test bằng Node. Prettier printWidth 120 (bỏ qua *.md). `npm run check` = lint + format:check +
    Vitest (tests/: 49 test, gồm PDF thật do pdf-lib tạo, đối chiếu catalog với JobCatalog.cs và clientTools.js).
  - catalog/categories.js: CATEGORIES -> tools {slug, name, desc, icon, job? | client?, faq?}. Có `job` mà API
    hỗ trợ -> dùng được; có `client` -> chạy trên trình duyệt; không có cả hai -> "Sắp có".
  - features/server-jobs/ServerTool.jsx: luồng chung chọn file/dán link -> tuỳ chọn -> useJob (XHR có % tải lên,
    hỏi trạng thái mỗi 2 giây) -> JobStatus. Báo khi máy xử lý đang tắt (job-types.online, job.workerOnline).
  - Công cụ trình duyệt (features/clientTools.js, nạp lazy): MergePdf, SplitPdf (JSZip), OrganizePdf
    (thumbnail pdf.js, kéo thả), CropPdf (setCropBox theo tỉ lệ), PdfEditor (EditPdf/AnnotatePdf/SignPdf:
    chữ, bút, tô sáng, che trắng, ảnh, chữ ký; lưu bằng writeAnnotations (pdf-lib), đổi toạ độ bằng
    viewport.convertToPdfPoint; thêm chữ thì ô nội dung tự focus không cuộn trang), SignaturePad, FillPdf,
    QrCode (qrcode), MergeImages (canvas, mergeLayout.js), TrimVideo (xem/chọn đoạn trên trình duyệt, cắt bằng job
    trim-video).
  - Chữ tiếng Việt trong PDF: nhúng phông Be Vietnam Pro (OFL) web/public/fonts, qua @pdf-lib/fontkit.
    FillPdf: updateFieldAppearances(font) rồi save({updateFieldAppearances:false}); tự đặt cỡ chữ theo
    chiều cao ô (cỡ tự động làm mất dấu nặng/chân chữ).
  - pdf.js 4.10.38 vẽ trang bằng requestAnimationFrame: tab/khung trình duyệt bị ẩn thì KHÔNG vẽ
    (gặp khi test trong Browser pane bị ẩn; người dùng thật không bị).
- `api/` .NET 10, **Clean Architecture** (17/11/2026, người dùng chọn Clean Architecture + Controllers; đợt này
  chỉ backend, worker/web/monitor làm sau theo cùng nguyên tắc). Hướng dẫn chi tiết: api/README.md.
  Thiết kế hệ thống: docs/kien-truc-he-thong.md. CongCuFile.sln + Directory.Build.props (net10.0, Nullable,
  AnalysisLevel latest-recommended, EnforceCodeStyleInBuild) + .editorconfig; build phải 0 cảnh báo.
  Chạy: `cd api; dotnet run --project src/CongCuFile.Api` (cổng 5100; Docker map 5100->8080). EF Core + SQLite,
  EnsureCreated (chưa migration; đổi entity phải xoá jobs.db khi dev). DataDir mặc định
  api/src/CongCuFile.Api/data (Docker /data). Bắt buộc cấu hình WorkerKey, AdminKey, Storage:SigningKey (dev có
  trong appsettings.Development.json; `dotnet new web --force` từng ghi đè file này, cẩn thận).
  - Domain: Entities (Job có MarkDone/MarkFailed/ResetForRetry/DownloadName/ForgetSecrets; ApiClient, Upload,
    Batch), Enums, Catalog/JobCatalog (+ .Lookup.cs), Jobs/JobOptionsValidator, JobPolicy (ưu tiên, 3 lượt).
  - Application (KHÔNG tham chiếu EF Core/ASP.NET): Common/Result (Error Validation/NotFound/Conflict/Forbidden/
    Gone; lỗi thường trả Result, không ném), IClock, IncomingFile, FileDownload, settings; Abstractions
    (IUnitOfWork, IJobRepository... hàm theo nghiệp vụ, IFileStore, ISignedLinkVerifier); service theo nhóm:
    Jobs/WebJobService, Workers/WorkerJobService + WorkerPresence (singleton), Admin/{Overview,JobAdmin,
    ApiClient}Service, Uploads/UploadService, Storage/SignedFileService, Batches/BatchService, ClientJobs/...
  - Infrastructure: AppDbContext (là IUnitOfWork; lỗi SQLite 19 -> UniqueConstraintException), Configurations,
    Repositories (ExecuteUpdate có điều kiện chống tranh chấp), LocalFileStore, StorageOptions, SystemClock.
  - Api: Controllers/{Web,Workers,Admin,V1} mỏng (FromResult), Authentication (3 scheme WorkerKey/AdminKey/
    ApiKey, 401 trả {error}), Common/ApiControllerBase + GlobalExceptionHandler, ApiLayer.cs.
  - Test: tests/CongCuFile.UnitTests (35) + tests/CongCuFile.IntegrationTests (15; WebApplicationFactory,
    FakeClock thay IClock nên test hết hạn giữ job không phải chờ). `cd api; dotnet test`.
  - Kho file: khoá "web/<guid>-input.ext", "uploads/<guid>.ext", "results/<guid>.ext" (regex kiểm tra trong
    FileKeys). LocalFileStore ký link /v1/files/{key}?exp&sig[&name] bằng HMAC (PUT tải lên, GET tải về,
    phương thức nằm trong chữ ký). PUT tự nới MaxRequestBodySize đúng bằng size đã khai (Upload:MaxBytes 1 GB).
  - API v1: uploads -> PUT -> batches (Idempotency-Key, unique (ClientId, IdempotencyKey); mỗi upload 1 job,
    CreatedAt + i tick giữ thứ tự) -> batches/{id} -> jobs/{id}/result (link 6 giờ). Chỉ công cụ Input "file".
    Mỗi app chỉ thấy của mình (404). Khoá "ccf_" + 32 byte, lưu SHA-256. JobStatus thêm Cancelled.
  - Ưu tiên: Job.Priority (web 10, lô 0); /next xếp Priority giảm dần rồi CreatedAt.
  - tests/smoke_v1.py: 30 kiểm tra (xác thực, tải lên, lô, idempotency, cô lập app, huỷ, ưu tiên, link,
    nguồn trong overview, thử lại job đã huỷ, khoá app) với worker main thật; đã chạy đúng hết 17/11/2026.
  - Domain/Catalog/JobCatalog.cs: danh mục loại job (Label, Extensions, Options, Worker "main"/"ai"/"photo", Input
    "file"/"url"/"none", UrlPattern). JobOption: Kind choice/text/password, Pattern, MaxLength, Required, Hint.
  - /next?types=a,b: worker chỉ nhận loại nó làm; API ghi lastSeen theo loại (online nếu < 30 giây).
  - Giữ job (lease): Job.Attempts + Job.LeaseUntil. /next tăng Attempts, đặt hạn 2 phút (JobLeaseSeconds),
    trả "attempt". Worker gửi POST /{id}/heartbeat?attempt=n mỗi 30 giây (HEARTBEAT_SECONDS, luồng phụ).
    Mỗi lần /next, API trả job quá hạn về Pending; quá 3 lượt thì Failed. /complete (form "attempt") và
    /fail (JSON "attempt") từ chối 409 nếu sai lượt hoặc không còn Processing. Worker thử gửi kết quả
    5 lần (5/10/20/40 giây) khi lỗi mạng/5xx; 409 thì bỏ kết quả. Lỗi do handler báo thì KHÔNG thử lại.
  - Kind "password": xoá khỏi Jobs.Options khi complete/fail, ẩn ở GET /api/jobs/{id}.
  - Job dạng url: InputFile="", link ở Options["url"], tên tải về lấy từ form "name" worker gửi.
  - Tên tải về: tên gốc + đuôi kết quả; cùng đuôi với file gốc thì thêm "-ket-qua".
  - Giới hạn form trang web 100 MB. MapFallback trả index.html (thiếu thì báo chạy npm run build); /api/* và
    /v1/* vẫn 404.
- `worker/` Python, làm lại 17/11/2026 (đợt 2, cùng nguyên tắc với backend; hướng dẫn: worker/README.md).
  main.py chỉ gọi congcufile_worker.app.main(). Package congcufile_worker: config.py (Settings frozen +
  settings() cache: MỌI biến môi trường; prepare_model_cache đặt HF_HOME/TORCH_HOME), registry.py
  (main_handlers/ai_handlers/photo_handlers nạp lười, handlers_for(profile)), core/ (api_client.py ApiClient,
  heartbeat.py, runner.py JobRunner.run_once/run_forever, process.py run_program/find_program (chương trình con
  Python in UTF-8 qua PYTHONIOENCODING), services.py call_service (dịch vụ HTTP tắt/quá giờ -> ToolError tiếng
  Việt "Dịch vụ xử lý PDF (Stirling-PDF) đang tắt..."; Stirling, Gotenberg, Ollama, ACE-Step đều qua đây), errors.py
  ToolError + JobTakenBackError, models.py Job/Handler; core KHÔNG import tools), tools/{pdf,image,media,ai,
  photo}. Handler vẫn (input_path, work_dir, options) -> Path; lỗi cho người dùng = ToolError. WORKER_PROFILE
  main | ai | photo | all. pyproject.toml (ruff line 120, pytest), requirements-dev.txt (pytest, ruff);
  tests/ 43 test (API giả bằng http.server, đối chiếu registry với JobCatalog.cs). Đã thử thật sau khi làm lại:
  smoke_v1 30/30, 8 nhóm công cụ qua API (FFmpeg, DXF, Gotenberg, Stirling), worker AI làm nét x2.
  - tools/photo/raw_develop.py: rawtherapee-cli -Y -p <profile có sẵn "Auto-Matched Curve - ISO Low/High"> -p
    profiles/<preset>.pp3 -o out (-t -b16 | -j95 -js3) -c raw; rồi exiftool -all= --ICC_Profile:all
    -TagsFromFile raw -all:all (bỏ Orientation, ảnh preview/thumbnail). RAWTHERAPEE_CLI, EXIFTOOL tự tìm.
    CHƯA chạy thật: máy cá nhân chưa cài RawTherapee/ExifTool; khoá .pp3 phải đối chiếu với profile có sẵn
    của bản RT cài. Ảnh mẫu RAW (CR3, NEF, ARW, RAF, DNG từ raw.pixls.us) đã tải vào scratchpad/raw-samples.
  - tools/pdf/stirling.py post(): gửi fileInput KÈM content-type (thiếu thì pdf->word/presentation/html báo 400),
    đuôi kết quả theo Content-Disposition, lỗi pdf-password đổi tiếng Việt.
  - tools/image/images.py (Pillow 13 có AVIF sẵn + pillow-heif cho HEIC), tools/media/ffmpeg.py (FFmpeg: nén/đổi video, đổi âm
    thanh, video->mp3, cắt video mã hoá lại cho chính xác).
  - tools/ai/audio.py: faster-whisper (large-v3-turbo GPU / small CPU), yt-dlp (YTDLP_COOKIES), DeepFilterNet
    bản chương trình độc lập deep-filter 0.5.6 (tự tải vào models/bin, không cần PyTorch), Demucs 4.1.0
    (gọi `python -m demucs --two-stems vocals --mp3`, không cần torchaudio).
  - tools/ai/image.py: Real-ESRGAN x2plus/x4plus qua spandrel, chia ô 256/512, giới hạn cạnh 3000/1500px.
  - tools/ai/text.py: Ollama (/api/chat, tự /api/pull nếu thiếu mô hình), pypdf/đọc docx; tóm tắt map-reduce,
    dịch theo đoạn 2500 ký tự. translate_pdf: gọi pdf2zh_next (PDFMathTranslate-next 2.10.2, AGPL, venv riêng
    .venv-pdf2zh hoặc PDF2ZH_BIN) với --ollama --ollama-model --ollama-host --lang-out --output
    --watermark-output-mode no_watermark --no-dual/--no-mono; kết quả *mono*.pdf / *dual*.pdf.
  - tools/ai/speech.py: VieNeu-TTS (pip vieneu 3.8.4, Apache-2.0, v3 Turbo 48 kHz, CPU bằng ONNX, không cần torch):
    Vieneu().infer(text, voice=tên) -> save wav -> FFmpeg ra mp3. 25 giọng (list_preset_voices); catalog chọn 8.
  - tools/ai/music.py: ACE-Step 1.5 qua REST (ACESTEP_URL, mặc định :8001): POST /release_task {prompt, lyrics,
    audio_duration, audio_format mp3, batch_size 1} -> POST /query_result {task_id_list} (status 1 xong, 2 lỗi,
    result là chuỗi JSON có "file") -> GET file. ACE-Step cài riêng (uv sync; uv run acestep-api). CHƯA thử thật.
  - tools/pdf/converters.py: image-to-text (Stirling img->pdf -> ocr-pdf force-ocr vie+eng -> pdf/text), xps-to-pdf
    (xpstopdf, gói libgxps-utils), djvu-to-pdf (ddjvu -format=pdf, gói djvulibre-bin), dxf-to-pdf (ezdxf
    recover + matplotlib qsave). xpstopdf/ddjvu chỉ có trong image Docker worker (Debian 13); trên Windows báo
    "chưa cài". DWG chưa làm (Debian không có gói libredwg).
  - API Input "none" (không file, chỉ nhập chữ: text-to-speech, generate-music) và JobOption Kind "textarea".
    GET /api/jobs/{id} trả outputExt; /output trả đúng content-type (FileExtensionContentTypeProvider) để
    trang web nghe thử âm thanh (<audio>) trong JobStatus.
  - Mô hình tải về models/ (HF_HOME, TORCH_HOME đặt trong config.prepare_model_cache).
  - Hai venv khi chạy tay: .venv (requirements.txt), .venv-ai (torch riêng + requirements-ai.txt).
    av phải < 16 (av 19 bỏ tham số metadata_errors mà faster-whisper 1.2.1 dùng).
- `monitor/` Tauri 2.12 (Rust edition 2024) + giao diện HTML/CSS/JS thuần trong monitor/ui (không npm).
  Bản egui đầu tiên bị chê xấu, bất tiện -> đã bỏ. Không cần tauri-cli: Cargo feature mặc định
  custom-protocol nhúng ui/ vào exe, `cargo run` là chạy; tauri.conf.json ở monitor/ (frontendDist "ui",
  withGlobalTauri, cửa sổ maximized), icons/icon.ico tự vẽ bằng Pillow. Rust chỉ đưa thư (API không mở CORS):
  lệnh overview, job_action (retry/cancel), check_services (ping song song, reqwest async + futures).
  JS gọi window.__TAURI__.core.invoke; cài đặt (apiUrl, key) lưu localStorage; hỏi API 2 giây, dịch vụ 5 giây.
  Làm lại 17/11/2026 (đợt 4, hướng dẫn: monitor/README.md): Rust tách main.rs / commands.rs (lớp mỏng) /
  admin_api.rs (AdminApi, JobAction, error_message) / services.rs; test bằng máy chủ HTTP giả test_server.rs
  (tokio dev-dependency), 7 test; clippy -D warnings, rustfmt.toml max_width 120. Giao diện: ES module
  ui/js/{main,state,api,settings,model,format,dom}.js + views/{topbar,belt,side,table,drawer}.js; view chỉ vẽ,
  main.js nghe mọi cú bấm qua data-*; model.js hàm thuần, test `node --test "tests-ui/*.test.js"` (17 test).
  Thiết kế: "băng chuyền" Hàng chờ -> Đang xử lý -> Kết quả là điểm nhấn; màu chỉ báo trạng thái
  (hổ phách chờ, mòng két chạy, xanh xong, đỏ lỗi); phông Segoe UI Variable, Be Vietnam Pro dự phòng.
  API: GET /api/admin/overview, POST /api/admin/jobs/{id}/retry|cancel (X-Admin-Key). "Thời gian" =
  UpdatedAt - CreatedAt (gồm chờ); job đang chạy = now - UpdatedAt; retry đặt lại CreatedAt, Attempts = 0.
  Chụp màn hình app bằng computer-use: request_access dùng đường dẫn đầy đủ tới monitor.exe; đưa cửa sổ lên
  trước bằng WScript.Shell AppActivate (open_application sẽ mở thêm một bản). Chưa xem kỹ giao diện sáng.
- Docker: docker-compose.yml có stirling-pdf, gotenberg, api, worker; profile "ai": ollama, worker-ai
  (GPU reservation). api/Dockerfile (node build web -> dotnet publish -> aspnet), worker/Dockerfile
  (python slim + ffmpeg), worker/Dockerfile.ai (nvidia/cuda 12.8.1 cudnn + torch cu128). .env.example.

## Hai máy

Cài máy RTX: docs/cai-dat-may-rtx.md (giữ cập nhật mỗi khi thêm phần mềm/biến cấu hình mới) +
scripts/kiem-tra-may.ps1 (chỉ đọc; PowerShell 5.1 nên file phải lưu UTF-8 CÓ BOM, không dùng ?? hay ?:).
docker-compose.yml có thêm worker-photo (image worker, WORKER_PROFILE=photo).

- Máy cá nhân (đang dùng): GTX 1650 4GB. Ổ C chỉ còn khoảng 13 GB (Docker lưu ở ổ C): KHÔNG build
  image AI ở đây. Ollama image 8,5 GB đã tải (container "ollama" chạy tay, volume "ollama" có qwen2.5:1.5b).
- Máy chạy thật: Core Ultra 5 245K, RAM 64GB, RTX 5060 Ti 16GB, ổ ~11TB, Windows.
- Chuyển máy qua Git (github.com/Stung16/extention_tools, private). data/, models/, .env, node_modules,
  api/src/CongCuFile.Api/wwwroot, .venv* không lên Git. Máy GPU phải làm lại: OCR tiếng Việt (README), .env.

## Đã chạy thử (16/11/2026, máy cá nhân)

- 35 loại job main: PDF (Stirling/Gotenberg), ảnh (nén JPG/HEIC/PNG, đổi AVIF->jpg/png/webp/pdf),
  video (nén 12MB->661KB, đổi định dạng, cắt 2,5-6s ra đúng 3,5s), âm thanh. Qua API + worker thật.
- AI trên CPU: chép lời tiếng Anh đúng từng chữ (txt, srt), lọc tạp âm giảm ồn ~29 dB, tách giọng
  (bản nhạc nền không còn lời), làm nét x2/x4, tóm tắt/dịch với qwen2.5:1.5b (dịch còn sai: Friday ->
  "thứ 5"; máy GPU dùng 7b). YouTube: bị chặn "not a bot" -> cần cookies; thông báo lỗi đã tiếng Việt.
  CHƯA thử: chép lời tiếng Việt thật, mọi thứ trên GPU, image Docker AI.
- Trình duyệt: gộp (4 trang), tách (zip 2 file), sắp xếp (đảo + xoay), cắt lề (đúng tỉ lệ), sửa PDF
  (chữ Việt, che trắng, bút, tô sáng đúng vị trí khi xem bằng ảnh), ký (ảnh chữ ký), điền biểu mẫu
  (chữ Việt đủ dấu sau khi chỉnh cỡ chữ), QR, gộp ảnh, cắt video. Giao diện điện thoại/máy tính không tràn.
- OCR tiếng Việt: data/stirling/tessdata có vie.traineddata (tessdata_best), TESS_BASE_PATH/TESSDATA_PREFIX.

## Lưu ý quan trọng

- RTX 50 (sm_120) cần PyTorch bản CUDA 12.8 trở lên.
- Giấy phép: VieNeu-TTS 0.3B cấm thương mại (0.5B Apache); PDFMathTranslate, PyMuPDF, pdf2docx AGPL;
  Stirling-PDF có phần độc quyền; Real-ESRGAN BSD-3; DeepFilterNet MIT/Apache; Be Vietnam Pro OFL.
- Stirling-PDF 3.3.0: tắt đăng nhập (SECURITY_ENABLELOGIN=false), chỉ mở 127.0.0.1. Tài liệu API:
  http://localhost:8080/v1/api-docs. Convert pdf->img mặc định bỏ qua ô biểu mẫu (includeAnnotations).
- Test bằng curl trong Git Bash làm vỡ dấu tiếng Việt ở giá trị -F; dùng Python requests hoặc trình duyệt.
- PowerShell không phân biệt hoa thường tên biến ($S và $s là một).
- Không làm công cụ lấy URL tuỳ ý (SSRF vào mạng nhà); YouTube chỉ nhận link youtube.com/youtu.be.

## Còn lại / để sau

- Đã gỡ khỏi trang web (16/11/2026): HEIC sang PDF, DWG sang PDF, PDF sang HTML, Chép lời YouTube, Tạo nhạc AI,
  và cả nhóm "AI" (Tóm tắt, Dịch tài liệu, Dịch PDF giữ bố cục). Code API/worker của các job này vẫn còn.
- Đã thử (16/11/2026 tối): ảnh sang chữ (hoá đơn tiếng Việt đúng từng chữ), DXF sang PDF (xem ảnh đúng),
  văn bản sang giọng nói (chép lời nghe lại ra đúng câu gốc; ~3,5 s cho 8 s tiếng trên CPU), dịch PDF giữ
  bố cục (bố cục, bảng, màu giữ đúng; nhưng qwen2.5:1.5b dịch dở, sót "```vi", "1234567890" -> cần 7b+),
  tạo nhạc chỉ thử được thông báo lỗi khi chưa có máy chủ ACE-Step.
- Docker vẫn lưu ở ổ C (C:\Users\admin\AppData\Local\Docker\wsl\disk\docker_data.vhdx ~38 GB, ổ C còn ~6 GB):
  muốn build image AI trên máy này phải chuyển "Disk image location" của Docker Desktop sang ổ D trước.
- Máy GPU: build và thử profile ai; thử chép lời tiếng Việt (cân nhắc PhoWhisper đổi sang CTranslate2).
- Hướng mới (17/11/2026): Công Cụ File là nền tảng xử lý; app khách (ví dụ web nhiếp ảnh gia, người dùng tự
  làm, KHÔNG phải việc của mình) gọi API v1. Lộ trình bước 1-4 trong docs/kien-truc-he-thong.md. Nhiếp ảnh gia:
  ảnh RAW đa dạng, xử lý nhiều ảnh, trung thực (không AI vẽ lại, không đổi mặt), không nhãn/metadata AI.
- Đã làm (16/11/2026): job kẹt khi worker tắt giữa chừng (lease + heartbeat, thử tắt worker thật: lượt 2 xong).
  Đã làm (17/11/2026): tự xoá file cũ (FileCleanupService + FileCleanupWorker 10 phút; trang web 2 giờ, app khách 24
  giờ; Cleanup:WebFileHours/ClientFileHours/IntervalMinutes; Job.FilesDeletedAt, UploadStatus.Expired; tải về 410;
  InitializeDatabase tự ALTER TABLE thêm cột mới qua AddColumnIfMissing; web FILE_KEEP_HOURS = 2 trong FAQ).
  Còn: bỏ container_name của worker để --scale, EF Core
  migrations, xem trước dung lượng từng mức nén, mở ra internet (HTTPS, chống lạm dụng, đăng nhập, gói
  trả phí), tên thương hiệu thật.
