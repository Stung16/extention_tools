import { useEffect, useRef, useState } from "react";
import FileDrop from "../components/FileDrop";
import { downloadBlob } from "../lib/utils";

const MAX_SIDE = 16000; // trình duyệt không vẽ được ảnh quá lớn

// Gộp nhiều ảnh thành một ảnh dọc hoặc ngang, chạy trên trình duyệt bằng canvas.
export default function MergeImages() {
  const [images, setImages] = useState([]); // [{ name, img }]
  const [direction, setDirection] = useState("vertical");
  const [gap, setGap] = useState(0);
  const [background, setBackground] = useState("#ffffff");
  const [format, setFormat] = useState("jpg");
  const [error, setError] = useState("");
  const preview = useRef(null);

  async function add(files) {
    setError("");
    const loaded = await Promise.all(files.map((f) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ name: f.name, img });
      img.onerror = () => resolve(null);
      img.src = URL.createObjectURL(f);
    })));
    if (loaded.includes(null)) setError("Có ảnh trình duyệt không đọc được (ảnh HEIC hãy đổi sang JPG trước bằng công cụ Đổi định dạng ảnh).");
    setImages((old) => [...old, ...loaded.filter(Boolean)]);
  }

  // Ảnh dọc: mọi ảnh cùng chiều rộng (bằng ảnh rộng nhất, để không làm mờ ảnh đẹp nhất).
  // Ảnh ngang: cùng chiều cao (bằng ảnh cao nhất).
  function layout(maxSide) {
    if (!images.length) return null;
    const vertical = direction === "vertical";
    const common = Math.max(...images.map(({ img }) => (vertical ? img.naturalWidth : img.naturalHeight)));
    const sizes = images.map(({ img }) => vertical
      ? { w: common, h: Math.round((img.naturalHeight * common) / img.naturalWidth) }
      : { w: Math.round((img.naturalWidth * common) / img.naturalHeight), h: common });
    let W = vertical ? common : sizes.reduce((s, x) => s + x.w, 0) + gap * (images.length - 1);
    let H = vertical ? sizes.reduce((s, x) => s + x.h, 0) + gap * (images.length - 1) : common;
    const scale = Math.min(1, maxSide / Math.max(W, H));
    return { sizes, W, H, scale, vertical };
  }

  function draw(canvas, maxSide) {
    const l = layout(maxSide);
    if (!l) return;
    canvas.width = Math.round(l.W * l.scale);
    canvas.height = Math.round(l.H * l.scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    let offset = 0;
    images.forEach(({ img }, i) => {
      const { w, h } = l.sizes[i];
      const [x, y] = l.vertical ? [0, offset] : [offset, 0];
      ctx.drawImage(img, x * l.scale, y * l.scale, w * l.scale, h * l.scale);
      offset += (l.vertical ? h : w) + gap;
    });
  }

  useEffect(() => {
    if (preview.current) draw(preview.current, 900);
  });

  function save() {
    const canvas = document.createElement("canvas");
    draw(canvas, MAX_SIDE);
    const type = format === "png" ? "image/png" : "image/jpeg";
    canvas.toBlob((b) => downloadBlob(b, `anh-da-gop.${format}`), type, 0.92);
  }

  return (
    <div className="panel wide">
      <FileDrop accept={[".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"]} multiple maxMB={null} onFiles={add}
                label={images.length ? "Thêm ảnh" : "Chọn các ảnh"} compact={images.length > 0} />
      {images.length > 0 && (
        <>
          <ol className="file-list">
            {images.map((im, i) => (
              <li key={i + im.name}>
                <span className="name">{i + 1}. {im.name}</span>
                <small>{im.img.naturalWidth}×{im.img.naturalHeight}</small>
                <button type="button" className="icon-btn" disabled={i === 0} onClick={() => setImages((o) => { const n = [...o]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })}>↑</button>
                <button type="button" className="icon-btn" onClick={() => setImages((o) => o.filter((_, k) => k !== i))}>✕</button>
              </li>
            ))}
          </ol>
          <div className="qr-grid">
            <div className="merge-preview"><canvas ref={preview} /></div>
            <div>
              <label className="inline">Ghép theo
                <select className="text-input" value={direction} onChange={(e) => setDirection(e.target.value)}>
                  <option value="vertical">Chiều dọc (từ trên xuống)</option>
                  <option value="horizontal">Chiều ngang (từ trái sang)</option>
                </select>
              </label>
              <label className="inline">Khoảng cách giữa ảnh: {gap}px
                <input type="range" min="0" max="80" value={gap} onChange={(e) => setGap(Number(e.target.value))} />
              </label>
              <label className="inline">Màu nền <input type="color" value={background} onChange={(e) => setBackground(e.target.value)} /></label>
              <label className="inline">Lưu dạng
                <select className="text-input" value={format} onChange={(e) => setFormat(e.target.value)}>
                  <option value="jpg">JPG (nhẹ)</option><option value="png">PNG (nét nhất)</option>
                </select>
              </label>
            </div>
          </div>
        </>
      )}
      {error && <p className="error-text">{error}</p>}
      <button className="btn" type="button" disabled={images.length < 2} onClick={save}>
        {images.length < 2 ? "Chọn ít nhất 2 ảnh" : `Gộp ${images.length} ảnh và tải về`}
      </button>
    </div>
  );
}
