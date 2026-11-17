# Trình giám sát (app desktop, Tauri)

Vỏ Rust nhỏ + giao diện HTML/CSS/JS thuần (không npm, không framework). Chạy trong thư mục `monitor`:

```
cargo run              # bản thử (nhanh build)
cargo run --release    # bản dùng thật: target/release/monitor.exe (~10 MB), chép đi đâu dùng cũng được
```

Giao diện (`ui/`) được nhúng vào file .exe, sửa giao diện thì chạy lại lệnh trên. Cách dùng app: README gốc,
mục "Trình giám sát".

## Vì sao có phần Rust

Giao diện chạy trong WebView (như một trang web). Trang web không gọi thẳng API được vì API không mở CORS (trình
duyệt chặn trang gọi sang địa chỉ khác). Phần Rust không bị chặn, nên làm "người đưa thư": giao diện gọi lệnh
Rust, Rust gọi API, trả kết quả về.

## Cấu trúc

```
src/                        phần Rust
  main.rs                   khởi động cửa sổ, đăng ký lệnh
  commands.rs               lệnh cho giao diện (lớp mỏng): overview, job_action, check_services
  admin_api.rs              gọi cửa quản trị của API (header X-Admin-Key), đổi lỗi thành câu tiếng Việt
  services.rs               kiểm tra Stirling-PDF, Gotenberg, Ollama CÙNG LÚC (mỗi cái chờ tối đa 2 giây)
  test_server.rs            máy chủ HTTP giả, chỉ dùng trong test
ui/                         giao diện
  index.html, styles.css    khung trang, toàn bộ CSS
  js/main.js                điểm khởi động: hỏi API mỗi 2 giây, dịch vụ mỗi 5 giây; xử lý MỌI cú bấm, phím tắt
  js/state.js               trạng thái của cả giao diện (một chỗ duy nhất)
  js/api.js                 MỌI lệnh gọi sang Rust (window.__TAURI__.core.invoke)
  js/settings.js            cài đặt (địa chỉ API, mã quản trị) lưu localStorage; danh sách dịch vụ cần kiểm tra
  js/model.js               TÍNH TOÁN: cảnh báo, dòng bảng, biểu đồ, chi tiết job (hàm thuần, không đụng trang)
  js/format.js              định dạng thời gian, dung lượng; esc() chống chèn HTML
  js/dom.js                 tiện ích nhỏ: $, thông báo góc màn hình
  js/views/                 VẼ từng phần: topbar (kết nối, cảnh báo), belt (băng chuyền), side (máy xử lý,
                            biểu đồ, con số), table (bảng có tab), drawer (ngăn chi tiết job)
tests-ui/                   test phần tính toán của giao diện (Node, không cần cài gì)
```

Luồng một lần cập nhật: `main.js` hỏi API qua `api.js` → lưu vào `state.js` → gọi các hàm `views/*` → mỗi view
lấy số liệu đã tính sẵn từ `model.js` rồi vẽ HTML.

Quy ước:

- **View chỉ vẽ, không gắn sự kiện.** Phần tử bấm được mang `data-*` (`data-job`, `data-act`, `data-tab`,
  `data-filter`, `data-attn`, `data-type`); `main.js` có một chỗ nghe mọi cú bấm và quyết định làm gì.
- **Tính toán để ở `model.js`**, nhận dữ liệu, trả dữ liệu. Nhờ vậy test được mà không cần mở app.
- **Mọi chữ từ API (tên file, câu lỗi...) đi qua `esc()`** trước khi đưa vào HTML.
- Lệnh Rust nhận tham số snake_case (`api_url`), bên JS gửi camelCase (`apiUrl`): Tauri tự đổi.

## Thêm một việc thường gặp

**Hiện thêm một con số từ API**: API thêm trường vào `/api/admin/overview` → tính trong `model.js` (kèm test) →
vẽ trong view phù hợp. Phần Rust không phải sửa (nó chuyển nguyên JSON).

**Thêm một thao tác quản trị mới** (ví dụ xoá job):
1. Rust: thêm biến thể vào `JobAction` trong `admin_api.rs` (hoặc hàm mới trong `AdminApi`), viết test.
2. Nếu là lệnh mới: thêm hàm `#[tauri::command]` trong `commands.rs` và đăng ký trong `main.rs`.
3. JS: thêm hàm trong `api.js`, nút trong view (mang `data-act`), xử lý trong `main.js`.

**Thêm dịch vụ cần kiểm tra**: thêm một dòng trong `serviceTargets()` (`ui/js/settings.js`).

## Kiểm tra code

```
cargo test                              # test Rust (máy chủ HTTP giả: header, đường dẫn, câu lỗi)
cargo clippy --all-targets -- -D warnings   # tìm lỗi, coi cảnh báo là lỗi
cargo fmt                               # định dạng code Rust (rustfmt.toml: dòng 120 ký tự)
node --test "tests-ui/*.test.js"        # test phần tính toán của giao diện
```

Cài clippy và rustfmt một lần: `rustup component add clippy rustfmt`. Định dạng JS/CSS (không bắt buộc) bằng
Prettier có sẵn bên web: `..\web\node_modules\.bin\prettier --write "ui/**/*.{js,css,html}" "tests-ui/*.js"`.

Phần vẽ và cú bấm chưa có test tự động: sau khi sửa, chạy app (cùng API + worker) và thử bằng tay.
