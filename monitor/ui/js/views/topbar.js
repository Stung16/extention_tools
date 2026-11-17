// Trạng thái kết nối (góc trên phải) và dải cảnh báo dưới thanh trên cùng.

import { $ } from "../dom.js";
import { esc, hostOf } from "../format.js";
import { attentionItems } from "../model.js";
import { sinceFetch, state } from "../state.js";

export function renderConnection() {
  const dot = $("conn").querySelector(".dot");
  if (state.err) {
    dot.className = "dot dot--bad";
    $("conn-text").textContent = state.ov ? "Mất kết nối API, đang hiện số liệu cũ" : "Chưa kết nối được API";
  } else if (state.ov) {
    dot.className = "dot dot--ok";
    const s = Math.round((Date.now() - state.updatedAt) / 1000);
    $("conn-text").textContent = s < 3 ? `Đã kết nối ${hostOf(state.settings.apiUrl)}` : `Cập nhật ${s} giây trước`;
  }
}

// Nút trong cảnh báo mang data-attn="settings" | "failed"; main.js xử lý khi bấm.
export function renderAttention() {
  const items = attentionItems(state, sinceFetch());
  const box = $("attention");
  if (!items.length) {
    box.innerHTML = state.ov
      ? `<p class="notice notice--calm"><span class="dot dot--ok"></span>Mọi thứ đang chạy bình thường.</p>`
      : "";
    return;
  }
  box.innerHTML = items
    .map(
      (it) => `
    <div class="notice notice--${it.level}">
      <span class="notice__text">${it.html}</span>
      ${it.action ? `<button class="btn btn--small" type="button" data-attn="${it.action.run}">${esc(it.action.label)}</button>` : ""}
    </div>`,
    )
    .join("");
}
