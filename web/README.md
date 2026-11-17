# Trang web (React + Vite)

Trang chủ, trang từng công cụ, và các công cụ chạy ngay trên trình duyệt. JavaScript (không TypeScript),
React 18, react-router 6. Chạy:

```
npm install        # một lần
npm run dev        # chạy thử ở http://localhost:5173 (cần API ở cổng 5100); sửa code là trang tự cập nhật
npm run build      # đóng gói vào api/src/CongCuFile.Api/wwwroot để API phục vụ ở http://localhost:5100
npm run check      # kiểm tra tất cả: ESLint + Prettier + test (chạy trước khi commit)
```

## Cấu trúc `src/`

```
main.jsx                  điểm khởi động: gắn React vào trang
app/                      khung ứng dụng
  App.jsx                 định tuyến: "/" trang chủ, "/:slug" trang công cụ
  Layout.jsx              thanh trên cùng, chân trang
pages/                    các trang
  HomePage.jsx            ô tìm kiếm + lưới công cụ theo nhóm
  ToolPage.jsx            trang một công cụ: phần thao tác + cách dùng + câu hỏi + công cụ cùng nhóm
  NotFoundPage.jsx
  tool-page/              phần dưới trang công cụ (toolHelp.js: nội dung cách dùng / câu hỏi)
features/                 các công cụ
  clientTools.js          danh sách công cụ chạy trên trình duyệt (nạp lười)
  server-jobs/            công cụ xử lý trên máy chủ: ServerTool (luồng chung), useJob (gửi + hỏi trạng thái),
                          JobStatus, OptionField, jobRequest.js (kiểm tra, tạo form), jobProgress.js (trạng thái)
  pdf/                    công cụ PDF trên trình duyệt
    MergePdf, SplitPdf, OrganizePdf, CropPdf, FillPdf .jsx    giao diện từng công cụ
    operations/           phép xử lý PDF thuần (pdf-lib): merge, split, organize, crop, fillForm
    editor/               trình sửa PDF (Sửa / Ghi chú / Ký): PdfEditor + thanh công cụ, pageObjects.js (dữ liệu
                          vật thể trên trang), writeAnnotations.js (vẽ vào PDF khi lưu), SignaturePad
    components/           PageCanvas (vẽ một trang), PagePager (chuyển trang)
    pdfDocument.js        mở PDF để sửa, phông tiếng Việt (pdf-lib, không cần trình duyệt)
    pdfViewer.js          đọc + vẽ trang ra màn hình (pdf.js, chỉ chạy trên trình duyệt)
  image/                  QrCode, MergeImages + mergeLayout.js (tính bố cục)
  video/                  TrimVideo (xem/chọn đoạn trên trình duyệt, cắt bằng job trim-video)
catalog/                  danh mục công cụ
  categories.js           DỮ LIỆU: các nhóm, các công cụ (slug, tên, mô tả, job hoặc client, câu hỏi riêng)
  faqs.js                 câu hỏi dùng chung
  queries.js              tra cứu: findTool, isToolReady, searchCatalog, relatedTools, nextSuggestions
  JobTypesContext.jsx     hỏi API một lần "loại job nào đang hỗ trợ"; component dùng useJobTypes()
api/jobsApi.js            MỌI lệnh gọi API .NET (job-types, tạo job, trạng thái, link tải kết quả)
shared/                   dùng chung, không biết gì về công cụ cụ thể
  components/             FileDrop, PickFilePanel, FileLine, ChoiceGroup, ToolCard/ToolGrid, Messages
  hooks/                  useTask (đang chạy + câu lỗi), useDocumentTitle
  lib/                    files.js (đuôi, tên, kiểm tra file, tải về), format.js, search.js, pointer.js
styles.css                toàn bộ CSS
```

## Quy tắc phụ thuộc

Giống các tầng của backend: thư mục bên phải không được dùng thư mục bên trái.

```
app  ->  pages  ->  features  ->  catalog  ->  api
                                      \-->  shared  (ai cũng dùng được; shared không dùng ai)
```

ESLint tự báo lỗi nếu vi phạm (ví dụ `shared/` import từ `features/`), xem `eslint.config.js`.

Hai quy ước nữa:

- **Logic xử lý tách khỏi giao diện.** Phép xử lý (gộp, tách, cắt PDF, kiểm tra tuỳ chọn, tính bố cục...) nằm trong
  file `.js` không dùng React, nhận dữ liệu và trả kết quả. Component `.jsx` chỉ giữ trạng thái, gọi hàm đó và vẽ
  giao diện. Nhờ vậy phần xử lý test được bằng Node, không cần mở trình duyệt.
- **Import bằng `@/`** (= `src/`): `import { formatSize } from "@/shared/lib/format"`. Trong cùng thư mục tính năng
  thì dùng đường dẫn tương đối (`./operations/merge`).

## Thêm một việc thường gặp

**Công cụ xử lý trên máy chủ** (đã có job ở API và worker): thêm một dòng vào `catalog/categories.js`:

```js
{ slug: "xoay-anh", name: "Xoay ảnh", icon: "XOAY", job: "rotate-image", desc: "Xoay ảnh 90, 180, 270 độ." },
```

Xong. Trang `/xoay-anh`, ô chọn file, tuỳ chọn (lấy từ `JobCatalog.cs`), tiến độ, tải về đều dùng chung `ServerTool`.

**Công cụ chạy trên trình duyệt:**

1. Viết phép xử lý thuần trong `features/<nhóm>/` (ví dụ `features/pdf/operations/watermark.js`) và test nó.
2. Viết component `features/<nhóm>/WatermarkPdf.jsx`: dùng `PickFilePanel` để chọn file, `useTask` cho trạng thái
   "đang lưu" + câu lỗi, `downloadBlob` để tải kết quả.
3. Khai báo trong `features/clientTools.js`: `watermark: lazy(() => import("@/features/pdf/WatermarkPdf")),`
4. Thêm vào `catalog/categories.js` với `client: "watermark"`.

**Gọi thêm API:** thêm hàm vào `api/jobsApi.js`, không gọi `fetch` rải rác trong component.

## Kiểm tra code

```
npm run lint          # ESLint: lỗi, sai quy tắc hook React, vi phạm quy tắc phụ thuộc
npm run format        # Prettier: tự định dạng code (dòng tối đa 120 ký tự)
npm test              # Vitest: chạy test trong tests/
npm run test:watch    # chạy lại test mỗi khi sửa code
```

Test (`tests/`): danh mục khớp với `JobCatalog.cs` của API và với `clientTools.js`; tra cứu, tìm kiếm không dấu;
kiểm tra tuỳ chọn và tạo form gửi job; đổi trạng thái job; gọi API (fetch giả); gộp / tách / sắp xếp / cắt lề /
điền biểu mẫu tiếng Việt / vẽ chữ, tô sáng, nét bút, ảnh vào PDF trên **file PDF thật** do pdf-lib tạo trong test.

Phần giao diện (bấm, kéo thả) chưa có test tự động: thử bằng tay trên trình duyệt sau khi sửa
(`npm run build`, mở http://localhost:5100).

## Lưu ý

- `npm run build` chạy `scripts/clean.mjs` trước: xoá FILE cũ trong wwwroot, giữ thư mục (API đang chạy giữ khoá
  thư mục, xoá cả thư mục sẽ báo EBUSY). wwwroot không đưa lên Git.
- Chữ tiếng Việt trong PDF: nhúng phông Be Vietnam Pro (OFL) ở `public/fonts`. Ô biểu mẫu phải tự đặt cỡ chữ theo
  chiều cao ô (`fontSizeForHeight`), cỡ tự động làm mất dấu nặng / chân chữ.
- pdf.js vẽ trang bằng requestAnimationFrame: tab trình duyệt bị ẩn thì trang chưa hiện (người dùng thật không gặp).
