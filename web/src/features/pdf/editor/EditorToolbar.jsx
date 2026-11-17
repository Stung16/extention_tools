import { INK_COLORS, MODES } from "./editorModes";

// Thanh công cụ của trình sửa PDF: các chế độ (thêm chữ, bút vẽ...) và màu mực.
export default function EditorToolbar({ modes, mode, onMode, color, onColor }) {
  const usesInk = modes.includes("text") || modes.includes("draw");
  return (
    <div className="toolbar">
      {modes.map((m) => (
        <button key={m} type="button" className={"tool-btn" + (mode === m ? " active" : "")} onClick={() => onMode(m)}>
          <span aria-hidden="true">{MODES[m].icon}</span> {MODES[m].label}
        </button>
      ))}
      {usesInk && (
        <span className="color-row">
          {INK_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={"swatch" + (color === c ? " active" : "")}
              style={{ background: c }}
              onClick={() => onColor(c)}
              aria-label={"Màu " + c}
            />
          ))}
        </span>
      )}
    </div>
  );
}
