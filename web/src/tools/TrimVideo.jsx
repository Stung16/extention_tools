import { useEffect, useRef, useState } from "react";
import FileDrop, { MAX_UPLOAD_MB } from "../components/FileDrop";
import JobStatus from "../components/JobStatus";
import useJob from "../components/useJob";

const fmt = (s) => {
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
};

// Cắt video: xem và chọn đoạn ngay trên trình duyệt, rồi gửi lên máy chủ để FFmpeg cắt (job "trim-video").
export default function TrimVideo({ jobTypes }) {
  const type = jobTypes["trim-video"];
  const [file, setFile] = useState(null);
  const [src, setSrc] = useState("");
  const [duration, setDuration] = useState(0);
  const [range, setRange] = useState([0, 0]);
  const video = useRef(null);
  const { state, start, reset } = useJob();

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

  function submit() {
    const data = new FormData();
    data.append("type", "trim-video");
    data.append("file", file);
    data.append("start", range[0].toFixed(1));
    data.append("end", range[1].toFixed(1));
    start(data);
  }

  if (!type) {
    return <div className="panel"><div className="soon-box"><h2>Chưa kết nối được máy chủ</h2><p>Công cụ cắt video cần máy chủ để xử lý.</p></div></div>;
  }
  if (state.phase !== "idle") {
    return <div className="panel"><JobStatus state={state} onAgain={() => { reset(); setFile(null); }} /></div>;
  }
  if (!file) return <div className="panel"><FileDrop accept={type.extensions} maxMB={MAX_UPLOAD_MB} onFiles={pick} /></div>;

  const [a, b] = range;
  return (
    <div className="panel wide">
      <video ref={video} src={src} controls className="video-preview" onTimeUpdate={onTime}
             onLoadedMetadata={(e) => { const d = Math.floor(e.target.duration * 10) / 10; setDuration(d); setRange([0, d]); }} />
      {duration > 0 && (
        <>
          <div className="trim-row">
            <label className="inline">Bắt đầu: <strong>{fmt(a)}</strong>
              <input type="range" min="0" max={duration} step="0.1" value={a} onChange={(e) => setRange([Math.min(Number(e.target.value), b - 0.1), b])} />
            </label>
            <button type="button" className="btn secondary small" onClick={() => setRange([Math.min(now(), b - 0.1), b])}>Lấy vị trí đang xem</button>
          </div>
          <div className="trim-row">
            <label className="inline">Kết thúc: <strong>{fmt(b)}</strong>
              <input type="range" min="0" max={duration} step="0.1" value={b} onChange={(e) => setRange([a, Math.max(Number(e.target.value), a + 0.1)])} />
            </label>
            <button type="button" className="btn secondary small" onClick={() => setRange([a, Math.max(now(), a + 0.1)])}>Lấy vị trí đang xem</button>
          </div>
          <p className="hint-line">Đoạn giữ lại dài {fmt(b - a)} (video gốc {fmt(duration)}).</p>
        </>
      )}
      <div className="row-buttons">
        <button className="btn secondary" type="button" onClick={playRange} disabled={!duration}>Xem thử đoạn đã chọn</button>
        <button className="btn" type="button" onClick={submit} disabled={!duration}>Cắt video</button>
      </div>
      <button type="button" className="link" onClick={() => setFile(null)}>Chọn video khác</button>
    </div>
  );
}
