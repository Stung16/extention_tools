import { useEffect, useRef, useState } from "react";
import { capturePointer } from "@/shared/lib/pointer";
import { inkBounds } from "./inkBounds";

// Hộp tạo chữ ký: vẽ bằng chuột/ngón tay, hoặc gõ tên. Trả về ảnh PNG nền trong suốt (data URL).
export default function SignaturePad({ onDone, onCancel }) {
  const [tab, setTab] = useState("draw");
  const [name, setName] = useState("");
  const [color, setColor] = useState("#1d3b8f");
  const canvas = useRef(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    hasInk.current = false;
    if (tab === "type" && name.trim()) {
      ctx.fillStyle = color;
      ctx.font = "italic 64px 'Segoe Script', 'Brush Script MT', 'Lucida Handwriting', cursive";
      ctx.textBaseline = "middle";
      ctx.fillText(name.trim(), 20, c.height / 2);
      hasInk.current = true;
    }
  }, [tab, name, color]);

  const point = (e) => {
    const r = canvas.current.getBoundingClientRect();
    return [
      ((e.clientX - r.left) * canvas.current.width) / r.width,
      ((e.clientY - r.top) * canvas.current.height) / r.height,
    ];
  };
  function down(e) {
    if (tab !== "draw") return;
    capturePointer(e.currentTarget, e.pointerId);
    drawing.current = true;
    const ctx = canvas.current.getContext("2d");
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(...point(e));
  }
  function move(e) {
    if (!drawing.current) return;
    const ctx = canvas.current.getContext("2d");
    ctx.lineTo(...point(e));
    ctx.stroke();
    hasInk.current = true;
  }
  const up = () => {
    drawing.current = false;
  };

  function clear() {
    canvas.current.getContext("2d").clearRect(0, 0, canvas.current.width, canvas.current.height);
    hasInk.current = false;
    setName("");
  }

  // Cắt sát phần có nét ký để ảnh chữ ký không thừa khoảng trống.
  function finish() {
    if (!hasInk.current) return;
    const c = canvas.current;
    const box = inkBounds(c.getContext("2d").getImageData(0, 0, c.width, c.height).data, c.width, c.height);
    if (!box) return;
    const out = document.createElement("canvas");
    out.width = box.w;
    out.height = box.h;
    out.getContext("2d").drawImage(c, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
    onDone(out.toDataURL("image/png"), box.w, box.h);
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Tạo chữ ký</h2>
        <div className="tabs">
          <button type="button" className={tab === "draw" ? "active" : ""} onClick={() => setTab("draw")}>
            Vẽ chữ ký
          </button>
          <button type="button" className={tab === "type" ? "active" : ""} onClick={() => setTab("type")}>
            Gõ tên
          </button>
        </div>
        {tab === "type" && (
          <input
            className="text-input"
            value={name}
            placeholder="Nhập họ tên của bạn"
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        )}
        <canvas
          ref={canvas}
          width={720}
          height={220}
          className="sign-canvas"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
        />
        <div className="color-row">
          Màu mực:
          {["#1d3b8f", "#111111", "#c0262d"].map((c) => (
            <button
              key={c}
              type="button"
              className={"swatch" + (color === c ? " active" : "")}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={c}
            />
          ))}
          <button type="button" className="link" onClick={clear}>
            Xoá
          </button>
        </div>
        <div className="row-buttons">
          <button type="button" className="btn secondary" onClick={onCancel}>
            Huỷ
          </button>
          <button type="button" className="btn" onClick={finish}>
            Dùng chữ ký này
          </button>
        </div>
      </div>
    </div>
  );
}
