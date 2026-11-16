import { outputUrl } from "../lib/api";
import { formatSize } from "../lib/utils";
import ToolCard from "./ToolCard";

// Hiện tiến độ và kết quả của một job (dùng với useJob).
const AUDIO_EXTS = [".mp3", ".wav", ".m4a", ".ogg", ".flac"];

export default function JobStatus({ state, onAgain, showSaving = false, suggestions = [], againLabel = "Xử lý file khác" }) {
  const { phase } = state;

  if (phase === "uploading") {
    const pct = Math.round((state.progress || 0) * 100);
    return (
      <div className="status">
        <h2>Đang tải file lên...</h2>
        <div className="progress"><div style={{ width: pct + "%" }} /></div>
        <p>{pct}%</p>
      </div>
    );
  }

  if (phase === "waiting" || phase === "processing") {
    const offline = state.job && state.job.workerOnline === false;
    return (
      <div className="status">
        <div className="spinner" />
        <h2>{phase === "waiting" ? "Đang chờ đến lượt..." : "Đang xử lý..."}</h2>
        {phase === "processing" && <p>Thường chỉ mất vài giây; file lớn hoặc công cụ AI có thể lâu hơn.</p>}
        {phase === "waiting" && (offline || state.waited > 15) && (
          <p className="warn">
            {offline
              ? "Máy xử lý cho công cụ này đang tắt. File vẫn được giữ và sẽ tự xử lý khi máy bật."
              : "Chờ hơi lâu: máy xử lý có thể đang bận với file khác."}
          </p>
        )}
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="status">
        <h2 className="err">Có lỗi xảy ra</h2>
        <p>{state.error}</p>
        <button className="btn secondary" type="button" onClick={onAgain}>Thử lại với file khác</button>
      </div>
    );
  }

  if (phase === "done") {
    const { job, id } = state;
    const saved = job.inputSize ? Math.round((1 - job.outputSize / job.inputSize) * 100) : 0;
    return (
      <div className="status">
        <h2 className="ok">Xong!</h2>
        {showSaving && job.inputSize ? (
          <>
            <p>{formatSize(job.inputSize)} → {formatSize(job.outputSize)}</p>
            <span className="saving">{saved > 0 ? `Giảm ${saved}%` : "File đã nhỏ sẵn, giữ nguyên file gốc"}</span>
          </>
        ) : (
          <p>File kết quả: {formatSize(job.outputSize)}</p>
        )}
        {AUDIO_EXTS.includes(job.outputExt) && (
          // Nghe thử ngay trên trang (đọc văn bản, tạo nhạc, lọc tạp âm...)
          <audio className="audio-preview" controls src={outputUrl(id)} />
        )}
        <a className="btn" href={outputUrl(id)}>Tải file xuống</a>
        <button className="btn secondary" type="button" onClick={onAgain}>{againLabel}</button>
        {suggestions.length > 0 && (
          <div className="next-tools">
            <p>Bạn có thể cần thêm:</p>
            <div className="grid">{suggestions.map((t) => <ToolCard key={t.slug} tool={t} ready />)}</div>
          </div>
        )}
      </div>
    );
  }

  return null;
}
