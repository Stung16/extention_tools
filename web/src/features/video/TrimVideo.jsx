import { useEffect, useRef, useState } from "react";
import { useJobTypes } from "@/catalog/JobTypesContext";
import JobStatus from "@/features/server-jobs/JobStatus";
import useJob from "@/features/server-jobs/useJob";
import FileDrop from "@/shared/components/FileDrop";
import { formatClock } from "@/shared/lib/format";

const JOB_TYPE = "trim-video";
const STEP = 0.1; // chọn điểm cắt chính xác tới 0,1 giây

// Cắt video: xem và chọn đoạn ngay trên trình duyệt, rồi gửi lên máy chủ để FFmpeg cắt (job "trim-video").
export default function TrimVideo() {
  const { jobTypes } = useJobTypes();
  const type = jobTypes[JOB_TYPE];
  const [file, setFile] = useState(null);
  const [src, setSrc] = useState("");
  const [duration, setDuration] = useState(0);
  const [range, setRange] = useState([0, 0]);
  const video = useRef(null);
  const { state, start, reset } = useJob();

  // Đổi video hoặc rời trang: giải phóng bộ nhớ của video cũ.
  useEffect(() => () => src && URL.revokeObjectURL(src), [src]);

  function pick([f]) {
    setFile(f);
    setSrc(URL.createObjectURL(f));
  }

  // Phát thử: dừng ở điểm kết thúc.
  function onTime() {
    if (video.current && video.current.currentTime >= range[1]) video.current.pause();
  }
  function playRange() {
    video.current.currentTime = range[0];
    video.current.play();
  }
  const now = () => Math.round((video.current?.currentTime || 0) * 10) / 10;
  // Điểm bắt đầu luôn trước điểm kết thúc ít nhất STEP giây.
  const setStart = (t) => setRange(([, b]) => [Math.min(t, b - STEP), b]);
  const setEnd = (t) => setRange(([a]) => [a, Math.max(t, a + STEP)]);

  function submit() {
    const data = new FormData();
    data.append("type", JOB_TYPE);
    data.append("file", file);
    data.append("start", range[0].toFixed(1));
    data.append("end", range[1].toFixed(1));
    start(data);
  }

  if (!type) {
    return (
      <div className="panel">
        <div className="soon-box">
          <h2>Chưa kết nối được máy chủ</h2>
          <p>Công cụ cắt video cần máy chủ để xử lý.</p>
        </div>
      </div>
    );
  }
  if (state.phase !== "idle") {
    return (
      <div className="panel">
        <JobStatus
          state={state}
          onAgain={() => {
            reset();
            setFile(null);
          }}
        />
      </div>
    );
  }
  if (!file)
    return (
      <div className="panel">
        <FileDrop accept={type.extensions} onFiles={pick} />
      </div>
    );

  const [a, b] = range;
  return (
    <div className="panel wide">
      <video
        ref={video}
        src={src}
        controls
        className="video-preview"
        onTimeUpdate={onTime}
        onLoadedMetadata={(e) => {
          const d = Math.floor(e.target.duration * 10) / 10;
          setDuration(d);
          setRange([0, d]);
        }}
      />
      {duration > 0 && (
        <>
          <div className="trim-row">
            <label className="inline">
              Bắt đầu: <strong>{formatClock(a)}</strong>
              <input
                type="range"
                min="0"
                max={duration}
                step={STEP}
                value={a}
                onChange={(e) => setStart(Number(e.target.value))}
              />
            </label>
            <button type="button" className="btn secondary small" onClick={() => setStart(now())}>
              Lấy vị trí đang xem
            </button>
          </div>
          <div className="trim-row">
            <label className="inline">
              Kết thúc: <strong>{formatClock(b)}</strong>
              <input
                type="range"
                min="0"
                max={duration}
                step={STEP}
                value={b}
                onChange={(e) => setEnd(Number(e.target.value))}
              />
            </label>
            <button type="button" className="btn secondary small" onClick={() => setEnd(now())}>
              Lấy vị trí đang xem
            </button>
          </div>
          <p className="hint-line">
            Đoạn giữ lại dài {formatClock(b - a)} (video gốc {formatClock(duration)}).
          </p>
        </>
      )}
      <div className="row-buttons">
        <button className="btn secondary" type="button" onClick={playRange} disabled={!duration}>
          Xem thử đoạn đã chọn
        </button>
        <button className="btn" type="button" onClick={submit} disabled={!duration}>
          Cắt video
        </button>
      </div>
      <button type="button" className="link" onClick={() => setFile(null)}>
        Chọn video khác
      </button>
    </div>
  );
}
