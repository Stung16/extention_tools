// Điểm khởi động giao diện trình giám sát:
//   - hỏi API mỗi 2 giây (số liệu tổng quan), kiểm tra dịch vụ phụ mỗi 5 giây;
//   - mỗi giây vẽ lại đồng hồ (không hỏi API);
//   - xử lý MỌI cú bấm / phím ở đây (các phần vẽ trong views/ chỉ vẽ, không tự gắn sự kiện).

import { checkServices, fetchOverview, hasTauri, runJobAction } from "./api.js";
import { $, toast } from "./dom.js";
import { addSample } from "./model.js";
import { saveSettings, serviceTargets, settingsFromForm } from "./settings.js";
import { resetConnection, state } from "./state.js";
import { renderBelt } from "./views/belt.js";
import { renderDrawer } from "./views/drawer.js";
import { renderChart, renderFacts, renderHealth } from "./views/side.js";
import { renderFilters, renderTable, renderTabs } from "./views/table.js";
import { renderAttention, renderConnection } from "./views/topbar.js";

const OVERVIEW_EVERY_MS = 2000;
const SERVICES_EVERY_MS = 5000;

function render() {
  renderConnection();
  renderAttention();
  renderBelt();
  renderHealth();
  renderChart();
  renderFacts();
  renderTable();
  renderDrawer();
}

// ---------- Hỏi API ----------

async function pollOverview() {
  if (!hasTauri) {
    state.err = "Trang này cần chạy trong app trình giám sát (cargo run trong thư mục monitor).";
  } else {
    try {
      const ov = await fetchOverview(state.settings);
      state.ov = ov;
      state.err = null;
      state.fetchedAt = performance.now();
      state.samples = addSample(state.samples, ov, Date.now());
    } catch (e) {
      state.err = String(e);
    }
  }
  state.updatedAt = Date.now();
  render();
  setTimeout(pollOverview, OVERVIEW_EVERY_MS);
}

async function pollServices() {
  if (hasTauri) {
    const targets = serviceTargets(state.settings.apiUrl);
    try {
      const results = await checkServices(targets);
      state.services = results.map((r, i) => ({ ...targets[i], ...r }));
    } catch {
      state.services = [];
    }
    renderHealth();
    renderAttention();
  }
  setTimeout(pollServices, SERVICES_EVERY_MS);
}

async function doJobAction(action) {
  try {
    await runJobAction(state.settings, state.selected, action);
    toast(action === "retry" ? "Đã đưa job vào lại hàng chờ." : "Đã huỷ job.");
    state.confirming = false;
  } catch (e) {
    toast(String(e), true);
    renderDrawer();
  }
}

// ---------- Thao tác của người dùng ----------

function setTab(tab) {
  state.tab = tab;
  renderTabs();
  renderFilters();
  renderTable();
}

function openJob(id) {
  state.selected = id;
  state.confirming = false;
  renderDrawer();
  renderTable();
}

function closeDrawer() {
  state.selected = null;
  renderDrawer();
  renderTable();
}

function openSettings() {
  $("set-api").value = state.settings.apiUrl;
  $("set-key").value = state.settings.key;
  $("settings").showModal();
}

// Bấm một công cụ trong bảng "Theo công cụ": tìm theo tên công cụ đó, chuyển sang tab có job của nó.
function filterByTool(type) {
  const t = state.ov?.types.find((x) => x.type === type);
  if (!t) return;
  $("search").value = state.search = t.label;
  setTab(t.pending ? "queue" : "history");
}

const ATTENTION_ACTIONS = {
  settings: openSettings,
  failed: () => {
    state.filter.history = "fail";
    setTab("history");
  },
};

async function onDrawerAction(act, button) {
  if (act === "close") closeDrawer();
  if (act === "copy") {
    try {
      await navigator.clipboard.writeText(state.selected);
      toast("Đã chép mã job.");
    } catch {
      toast("Không chép được mã job.", true);
    }
  }
  if (act === "ask-cancel" || act === "keep") {
    state.confirming = act === "ask-cancel";
    renderDrawer();
  }
  if (act === "retry" || act === "cancel") {
    button.disabled = true;
    await doJobAction(act);
  }
}

// Một chỗ nghe mọi cú bấm (kể cả phần tử vẽ lại sau này), xem phần tử được bấm mang data-* nào.
document.addEventListener("click", (e) => {
  const el = (selector) => e.target.closest(selector);
  let target;
  if ((target = el("[data-act]"))) return onDrawerAction(target.dataset.act, target);
  if ((target = el("[data-attn]"))) return ATTENTION_ACTIONS[target.dataset.attn]?.();
  if ((target = el("[data-tab]"))) return setTab(target.dataset.tab);
  if ((target = el("[data-filter]"))) {
    state.filter[state.tab] = target.dataset.filter;
    renderFilters();
    return renderTable();
  }
  if ((target = el("[data-job]"))) return openJob(target.dataset.job);
  if ((target = el("[data-type]"))) return filterByTool(target.dataset.type);
});

$("open-settings").addEventListener("click", openSettings);

$("search").addEventListener("input", (e) => {
  state.search = e.target.value;
  renderTable();
});

$("settings").addEventListener("close", () => {
  if ($("settings").returnValue !== "save") return;
  state.settings = settingsFromForm($("set-api").value, $("set-key").value);
  saveSettings(state.settings);
  resetConnection();
  toast("Đã lưu. Đang kết nối lại…");
  render();
});

// Phím tắt: "/" để tìm, Esc để đóng ngăn chi tiết.
document.addEventListener("keydown", (e) => {
  if ($("settings").open) return;
  if (e.key === "/" && document.activeElement !== $("search")) {
    e.preventDefault();
    $("search").focus();
  }
  if (e.key === "Escape" && state.selected) closeDrawer();
});

// Mỗi giây: chạy tiếp đồng hồ job và dòng "cập nhật ... trước" mà không cần hỏi lại API.
setInterval(() => {
  if (state.ov) {
    renderConnection();
    renderBelt();
  }
}, 1000);

setTab("queue");
render();
pollOverview();
pollServices();
