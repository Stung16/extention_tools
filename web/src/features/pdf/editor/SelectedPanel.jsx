import { useEffect, useRef } from "react";

// Khung chỉnh vật thể đang chọn: sửa nội dung và cỡ chữ (với chữ), nút xoá.
export default function SelectedPanel({ object, onChange, onRemove }) {
  const textBox = useRef(null);

  // Chọn chữ mới: đưa con trỏ vào ô nội dung (bôi đen chữ mẫu để gõ đè luôn) nhưng KHÔNG cuộn trang,
  // để người dùng vẫn nhìn thấy trang PDF và chữ hiện ra ngay khi gõ.
  useEffect(() => {
    if (object.type !== "text" || !textBox.current) return;
    textBox.current.focus({ preventScroll: true });
    textBox.current.select();
  }, [object.id, object.type]);

  return (
    <div className="props">
      {object.type === "text" && (
        <>
          <label className="option-label" htmlFor="obj-text">
            Nội dung chữ
          </label>
          <textarea
            ref={textBox}
            id="obj-text"
            className="text-input"
            rows={3}
            value={object.text}
            onChange={(e) => onChange({ text: e.target.value })}
          />
          <label className="inline">
            Cỡ chữ
            <input
              type="range"
              min="8"
              max="48"
              value={object.size}
              onChange={(e) => onChange({ size: Number(e.target.value) })}
            />
            {object.size}
          </label>
        </>
      )}
      <button type="button" className="link danger" onClick={onRemove}>
        Xoá mục này
      </button>
    </div>
  );
}
