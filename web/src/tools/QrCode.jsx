import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { downloadBlob } from "../lib/utils";

// Tạo mã QR ngay trên trình duyệt; tải về dạng PNG hoặc SVG.
export default function QrCode() {
  const [text, setText] = useState("https://");
  const [size, setSize] = useState(512);
  const [dark, setDark] = useState("#000000");
  const [light, setLight] = useState("#ffffff");
  const [level, setLevel] = useState("M");
  const [error, setError] = useState("");
  const canvas = useRef(null);

  const options = { width: size, margin: 2, errorCorrectionLevel: level, color: { dark, light } };

  useEffect(() => {
    if (!text.trim()) return;
    QRCode.toCanvas(canvas.current, text, options)
      .then(() => setError(""))
      .catch(() => setError("Nội dung quá dài để tạo mã QR."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, size, dark, light, level]);

  const png = () => canvas.current.toBlob((b) => downloadBlob(b, "ma-qr.png"), "image/png");
  const svg = async () => downloadBlob(await QRCode.toString(text, { ...options, type: "svg" }), "ma-qr.svg", "image/svg+xml");

  return (
    <div className="panel">
      <div className="option first">
        <label className="option-label" htmlFor="qr-text">Nội dung (đường link, chữ, số điện thoại...)</label>
        <textarea id="qr-text" className="text-input" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <div className="qr-grid">
        <div className="qr-preview">{text.trim() ? <canvas ref={canvas} /> : <p className="hint-line">Nhập nội dung để tạo mã.</p>}</div>
        <div>
          <label className="inline">Kích thước
            <select className="text-input" value={size} onChange={(e) => setSize(Number(e.target.value))}>
              {[256, 512, 1024, 2048].map((s) => <option key={s} value={s}>{s} × {s} px</option>)}
            </select>
          </label>
          <label className="inline">Độ bền (chịu bẩn, che khuất)
            <select className="text-input" value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="L">Thấp</option><option value="M">Vừa</option><option value="Q">Khá</option><option value="H">Cao</option>
            </select>
          </label>
          <label className="inline">Màu mã <input type="color" value={dark} onChange={(e) => setDark(e.target.value)} /></label>
          <label className="inline">Màu nền <input type="color" value={light} onChange={(e) => setLight(e.target.value)} /></label>
        </div>
      </div>
      {error && <p className="error-text">{error}</p>}
      <div className="row-buttons">
        <button className="btn secondary" type="button" disabled={!text.trim() || !!error} onClick={svg}>Tải SVG</button>
        <button className="btn" type="button" disabled={!text.trim() || !!error} onClick={png}>Tải PNG</button>
      </div>
    </div>
  );
}
