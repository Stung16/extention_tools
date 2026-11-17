import FileDrop from "./FileDrop";
import { ErrorText } from "./Messages";

// Khung đầu tiên của công cụ chạy trên trình duyệt: chỉ có ô chọn file (và câu lỗi nếu file không đọc được).
// Mặc định nhận một file PDF, không giới hạn dung lượng (file không gửi lên máy chủ).
export default function PickFilePanel({ onFiles, error, accept = [".pdf"], maxMB = null }) {
  return (
    <div className="panel">
      <FileDrop accept={accept} maxMB={maxMB} onFiles={onFiles} />
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
