// Đổi trạng thái job của API sang "giai đoạn" hiện trên trang.
//   API:  Pending | Processing | Done | Failed | Cancelled
//   Trang: "idle" (chưa gửi) | "uploading" | "waiting" | "processing" | "done" | "error"

export const POLL_MS = 2000; // hỏi trạng thái mỗi 2 giây
export const RETRY_MS = 3000; // mất mạng thoáng qua: 3 giây sau hỏi lại
export const SLOW_WAIT_SECONDS = 15; // chờ quá lâu thì báo "máy xử lý có thể đang bận"

export function phaseOf(job) {
  switch (job.status) {
    case "Done":
      return "done";
    case "Failed":
    case "Cancelled":
      return "error";
    case "Pending":
      return "waiting";
    default:
      return "processing";
  }
}

// Câu lỗi hiện cho người dùng khi job thất bại / bị huỷ.
export function errorOf(job) {
  if (job.status === "Cancelled") return job.error || "Yêu cầu đã bị huỷ.";
  return job.error || "Không rõ lý do.";
}

// Có nên báo "đợi lâu" không: máy xử lý đang tắt, hoặc đã chờ quá lâu.
export function waitNotice(state) {
  if (state.phase !== "waiting") return "";
  if (state.job?.workerOnline === false)
    return "Máy xử lý cho công cụ này đang tắt. File vẫn được giữ và sẽ tự xử lý khi máy bật.";
  if (state.waited > SLOW_WAIT_SECONDS) return "Chờ hơi lâu: máy xử lý có thể đang bận với file khác.";
  return "";
}

// Phần trăm dung lượng giảm được (cho công cụ nén). Không nhỏ đi thì 0.
export function savedPercent(job) {
  if (!job.inputSize) return 0;
  return Math.max(0, Math.round((1 - job.outputSize / job.inputSize) * 100));
}
