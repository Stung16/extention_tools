import { outputUrl } from "@/api/jobsApi";
import { FILE_KEEP_HOURS } from "@/shared/lib/files";
import { formatSize } from "@/shared/lib/format";
import { ToolGrid } from "@/shared/components/ToolCard";
import { savedPercent, waitNotice } from "./jobProgress";

const AUDIO_EXTS = [".mp3", ".wav", ".m4a", ".ogg", ".flac"];

// Hiện tiến độ và kết quả của một job (state lấy từ useJob).
//   showSaving   hiện "Giảm x%" (công cụ nén)
//   suggestions  công cụ gợi ý làm tiếp sau khi xong
export default function JobStatus({
  state,
  onAgain,
  showSaving = false,
  suggestions = [],
  againLabel = "Xử lý file khác",
}) {
  const { phase } = state;

  if (phase === "uploading") {
    const pct = Math.round((state.progress || 0) * 100);
    return (
      <div className="status">
        <h2>Đang tải file lên...</h2>
        <div className="progress">
          <div style={{ width: pct + "%" }} />
        </div>
        <p>{pct}%</p>
      </div>
    );
  }

  if (phase === "waiting" || phase === "processing") {
    const notice = waitNotice(state);
    return (
      <div className="status">
        <div className="spinner" />
        <h2>{phase === "waiting" ? "Đang chờ đến lượt..." : "Đang xử lý..."}</h2>
        {phase === "processing" && <p>Thường chỉ mất vài giây; file lớn hoặc công cụ AI có thể lâu hơn.</p>}
        {notice && <p className="warn">{notice}</p>}
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="status">
        <h2 className="err">Có lỗi xảy ra</h2>
        <p>{state.error}</p>
        <button className="btn secondary" type="button" onClick={onAgain}>
          Thử lại với file khác
        </button>
      </div>
    );
  }

  if (phase === "done") {
    const { job, id } = state;
    const saved = savedPercent(job);
    return (
      <div className="status">
        <h2 className="ok">Xong!</h2>
        {showSaving && job.inputSize ? (
          <>
            <p>
              {formatSize(job.inputSize)} → {formatSize(job.outputSize)}
            </p>
            <span className="saving">{saved > 0 ? `Giảm ${saved}%` : "File đã nhỏ sẵn, giữ nguyên file gốc"}</span>
          </>
        ) : (
          <p>File kết quả: {formatSize(job.outputSize)}</p>
        )}
        {AUDIO_EXTS.includes(job.outputExt) && (
          // Nghe thử ngay trên trang (đọc văn bản, lọc tạp âm...)
          <audio className="audio-preview" controls src={outputUrl(id)} />
        )}
        <a className="btn" href={outputUrl(id)}>
          Tải file xuống
        </a>
        <p className="hint-line">File được giữ {FILE_KEEP_HOURS} giờ, sau đó tự xoá khỏi máy chủ.</p>
        <button className="btn secondary" type="button" onClick={onAgain}>
          {againLabel}
        </button>
        {suggestions.length > 0 && (
          <div className="next-tools">
            <p>Bạn có thể cần thêm:</p>
            <ToolGrid tools={suggestions} isReady={() => true} />
          </div>
        )}
      </div>
    );
  }

  return null;
}
