// Nội dung phần "Cách dùng" và "Câu hỏi thường gặp" của trang công cụ (hàm thuần, test được).
//   type: loại job lấy từ API (null nếu là công cụ chạy trên trình duyệt hoặc API chưa hỗ trợ)

import { FILE_KEEP_HOURS, MAX_UPLOAD_MB } from "@/shared/lib/files";

const DONE_STEP = 'Chờ tới khi báo "Xong!", rồi tải file kết quả về máy.';

export function howToSteps(tool, type) {
  if (tool.client) {
    return [
      "Chọn hoặc kéo thả file vào khung phía trên.",
      "Thao tác trực tiếp trên trang: mọi thứ chạy ngay trên trình duyệt của bạn.",
      "Bấm nút lưu để tải file kết quả về máy.",
    ];
  }
  const optionsStep = type?.options?.length ? "Chọn tuỳ chọn phù hợp, rồi bấm nút xử lý." : null;
  if (type?.input === "none") {
    return [
      "Gõ hoặc dán nội dung vào ô phía trên.",
      "Chọn tuỳ chọn phù hợp, rồi bấm nút xử lý.",
      'Chờ tới khi báo "Xong!", nghe thử rồi tải về máy.',
    ];
  }
  if (type?.input === "url") {
    return ["Dán đường link vào ô phía trên.", optionsStep || `Bấm nút "${tool.name}".`, DONE_STEP];
  }
  const exts = type?.extensions?.slice(0, 4).join(", ");
  return [
    `Bấm "Chọn file" hoặc kéo thả file${exts ? ` (${exts}...)` : ""} vào khung phía trên.`,
    optionsStep || `Bấm nút "${tool.name}" để bắt đầu.`,
    DONE_STEP,
  ];
}

// [[câu hỏi, trả lời], ...]: câu riêng của công cụ trước, rồi các câu chung.
export function faqItems(tool, type) {
  const items = [...(tool.faq || [])];
  if (type?.extensions?.length) items.push(["Công cụ nhận những loại file nào?", type.extensions.join(", ")]);
  items.push(["Công cụ này có mất phí không?", "Hiện tại bạn dùng miễn phí."]);
  if (!tool.client) {
    items.push(["File tối đa bao nhiêu?", `Mỗi file tối đa ${MAX_UPLOAD_MB} MB.`]);
    items.push([
      "File của tôi được giữ trên máy chủ bao lâu?",
      `File bạn gửi lên và file kết quả tự động bị xoá khỏi máy chủ ${FILE_KEEP_HOURS} giờ sau khi xử lý xong. Hãy tải kết quả về trước khi hết hạn.`,
    ]);
    items.push([
      "File của tôi được xử lý ở đâu?",
      "File được gửi lên máy chủ của chúng tôi để xử lý bằng phần mềm mã nguồn mở, không gửi cho bên thứ ba.",
    ]);
  }
  return items;
}
