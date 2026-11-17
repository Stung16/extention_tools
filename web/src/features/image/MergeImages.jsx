import { useEffect, useRef, useState } from "react";
import FileDrop from "@/shared/components/FileDrop";
import { ErrorText } from "@/shared/components/Messages";
import { downloadBlob } from "@/shared/lib/files";
import { mergeLayout } from "./mergeLayout";

const IMAGE_TYPES = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"];
const PREVIEW_SIDE = 900;

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
    const loaded = await Promise.all(files.map(loadImage));
    if (loaded.includes(null))
      setError("Có ảnh trình duyệt không đọc được (ảnh HEIC hãy đổi sang JPG trước bằng công cụ Đổi định dạng ảnh).");
    setImages((old) => [...old, ...loaded.filter(Boolean)]);
  }

  function draw(canvas, maxSide) {
    const sizes = images.map(({ img }) => ({ width: img.naturalWidth, height: img.naturalHeight }));
    const layout = mergeLayout(sizes, direction, gap, maxSide);
    if (!layout) return;
    canvas.width = layout.width;
    canvas.height = layout.height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    images.forEach(({ img }, i) => {
      const p = layout.places[i];
      ctx.drawImage(img, p.x, p.y, p.w, p.h);
    });
  }

  // Vẽ lại ảnh xem trước sau mỗi thay đổi.
  useEffect(() => {
    if (preview.current) draw(preview.current, PREVIEW_SIDE);
  });

  function save() {
    const canvas = document.createElement("canvas");
    draw(canvas); // cỡ thật (tối đa MAX_SIDE)
    const type = format === "png" ? "image/png" : "image/jpeg";
    canvas.toBlob((b) => downloadBlob(b, `anh-da-gop.${format}`), type, 0.92);
  }

  const moveUp = (i) =>
    setImages((old) => {
      const next = [...old];
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      return next;
    });

  return (
    <div className="panel wide">
      <FileDrop
        accept={IMAGE_TYPES}
        multiple
        maxMB={null}
        onFiles={add}
        label={images.length ? "Thêm ảnh" : "Chọn các ảnh"}
        compact={images.length > 0}
      />
      {images.length > 0 && (
        <>
          <ol className="file-list">
            {images.map((im, i) => (
              <li key={i + im.name}>
                <span className="name">
                  {i + 1}. {im.name}
                </span>
                <small>
                  {im.img.naturalWidth}×{im.img.naturalHeight}
                </small>
                <button
                  type="button"
                  className="icon-btn"
                  disabled={i === 0}
                  onClick={() => moveUp(i)}
                  title="Lên trên"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setImages((o) => o.filter((_, k) => k !== i))}
                  title="Bỏ ảnh này"
                >
                  ✕
                </button>
              </li>
            ))}
          </ol>
          <div className="qr-grid">
            <div className="merge-preview">
              <canvas ref={preview} />
            </div>
            <div>
              <label className="inline">
                Ghép theo
                <select className="text-input" value={direction} onChange={(e) => setDirection(e.target.value)}>
                  <option value="vertical">Chiều dọc (từ trên xuống)</option>
                  <option value="horizontal">Chiều ngang (từ trái sang)</option>
                </select>
              </label>
              <label className="inline">
                Khoảng cách giữa ảnh: {gap}px
                <input type="range" min="0" max="80" value={gap} onChange={(e) => setGap(Number(e.target.value))} />
              </label>
              <label className="inline">
                Màu nền <input type="color" value={background} onChange={(e) => setBackground(e.target.value)} />
              </label>
              <label className="inline">
                Lưu dạng
                <select className="text-input" value={format} onChange={(e) => setFormat(e.target.value)}>
                  <option value="jpg">JPG (nhẹ)</option>
                  <option value="png">PNG (nét nhất)</option>
                </select>
              </label>
            </div>
          </div>
        </>
      )}
      <ErrorText>{error}</ErrorText>
      <button className="btn" type="button" disabled={images.length < 2} onClick={save}>
        {images.length < 2 ? "Chọn ít nhất 2 ảnh" : `Gộp ${images.length} ảnh và tải về`}
      </button>
    </div>
  );
}

// Đọc ảnh để vẽ lên canvas. Trình duyệt không đọc được thì trả null.
function loadImage(file) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ name: file.name, img });
    img.onerror = () => resolve(null);
    img.src = URL.createObjectURL(file);
  });
}
