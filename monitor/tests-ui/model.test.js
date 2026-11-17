// Test phần tính toán của giao diện (ui/js/model.js, format.js, settings.js). Chạy: node --test tests-ui
// Dùng trình chạy test có sẵn của Node, không cần cài gì thêm.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ago, bytes, clock, dur, esc, hostOf, shortDur } from "../ui/js/format.js";
import {
  addSample,
  attentionItems,
  chartData,
  facts,
  findJob,
  healthRows,
  historyRows,
  jobAction,
  jobDetails,
  leaseInfo,
  queueRows,
  SAMPLE_WINDOW_MS,
  toolRows,
} from "../ui/js/model.js";
import { DEFAULTS, loadSettings, saveSettings, serviceTargets, settingsFromForm } from "../ui/js/settings.js";

// Số liệu giống GET /api/admin/overview.
function overview(overrides = {}) {
  return {
    totals: { pending: 2, processing: 1, done: 40, failed: 3 },
    last24h: { done: 10, failed: 1, avgSeconds: 12 },
    workers: [
      { name: "main", online: true, pending: 1, processing: 1, lastSeenSecondsAgo: 2 },
      { name: "ai", online: false, pending: 1, processing: 0, lastSeenSecondsAgo: 3600 },
    ],
    waiting: [
      {
        id: "w1",
        label: "Nén PDF",
        name: "bao-cao.pdf",
        type: "compress-pdf",
        worker: "main",
        waitSeconds: 30,
        attempts: 0,
        source: "Trang web",
      },
      {
        id: "w2",
        label: "Chép lời",
        name: "ghi-am.mp3",
        type: "transcribe-audio",
        worker: "ai",
        waitSeconds: 600,
        attempts: 1,
        source: "Trang web",
      },
    ],
    running: [
      {
        id: "r1",
        label: "Nén video",
        name: "v.mp4",
        worker: "main",
        seconds: 20,
        attempt: 2,
        leaseSecondsLeft: 60,
        source: "Trang web",
      },
    ],
    recent: [
      {
        id: "d1",
        label: "Nén ảnh",
        name: "a.png",
        status: "Done",
        agoSeconds: 100,
        seconds: 3,
        attempts: 1,
        source: "Trang web",
      },
      {
        id: "f1",
        label: "Word sang PDF",
        name: "b.docx",
        status: "Failed",
        agoSeconds: 50,
        seconds: 4,
        attempts: 3,
        error: "Gotenberg tắt",
        source: "App: Web ảnh",
        batchId: "1234567890ab",
      },
      {
        id: "c1",
        label: "Nén PDF",
        name: "c.pdf",
        status: "Cancelled",
        agoSeconds: 10,
        seconds: 1,
        attempts: 0,
        source: "Trang web",
      },
    ],
    types: [
      {
        type: "compress-pdf",
        label: "Nén PDF",
        worker: "main",
        online: true,
        pending: 1,
        processing: 0,
        done24h: 5,
        failed24h: 0,
      },
      {
        type: "word-to-pdf",
        label: "Word sang PDF",
        worker: "main",
        online: true,
        pending: 0,
        processing: 0,
        done24h: 0,
        failed24h: 1,
      },
      {
        type: "ocr-pdf",
        label: "OCR PDF",
        worker: "main",
        online: true,
        pending: 0,
        processing: 0,
        done24h: 0,
        failed24h: 0,
      },
      {
        type: "transcribe-audio",
        label: "Chép lời",
        worker: "ai",
        online: false,
        pending: 1,
        processing: 0,
        done24h: 0,
        failed24h: 0,
      },
    ],
    storage: { files: 12, bytes: 1536 },
    oldestPendingSeconds: 600,
    ...overrides,
  };
}

describe("định dạng", () => {
  it("thời gian", () => {
    assert.equal(dur(65), "1 phút 5 giây");
    assert.equal(dur(3725), "1 giờ 2 phút");
    assert.equal(shortDur(125), "2 phút");
    assert.equal(ago(3), "vừa xong");
    assert.equal(ago(90), "1 phút trước");
    assert.equal(clock(75), "1:15");
    assert.equal(clock(3725), "1:02:05");
    assert.equal(clock(-5), "0:00");
  });

  it("dung lượng, địa chỉ, chống chèn HTML", () => {
    assert.equal(bytes(1536), "1,5 KB");
    assert.equal(bytes(10), "10 B");
    assert.equal(hostOf("http://may-chu:5100/"), "may-chu:5100");
    assert.equal(hostOf("sai địa chỉ"), "sai địa chỉ");
    assert.equal(esc(`<img src=x onerror="a">`), "&lt;img src=x onerror=&quot;a&quot;&gt;");
    assert.equal(esc(null), "");
  });
});

describe("cài đặt", () => {
  const memory = (data = {}) => ({ getItem: (k) => data[k] ?? null, setItem: (k, v) => (data[k] = v), data });

  it("mặc định, lưu rồi đọc lại, đổi mã worker cũ sang mã quản trị", () => {
    assert.deepEqual(loadSettings(memory()), DEFAULTS);
    const store = memory();
    saveSettings({ apiUrl: "http://x:1", key: "k" }, store);
    assert.deepEqual(loadSettings(store), { apiUrl: "http://x:1", key: "k" });
    assert.equal(loadSettings(memory({ "monitor.settings": '{"key":"dev-worker-key"}' })).key, DEFAULTS.key);
    assert.deepEqual(loadSettings(memory({ "monitor.settings": "hỏng" })), DEFAULTS);
  });

  it("làm sạch giá trị nhập, dịch vụ cùng máy với API", () => {
    assert.deepEqual(settingsFromForm(" http://may:5100// ", " k "), { apiUrl: "http://may:5100", key: "k" });
    const targets = serviceTargets("http://192.168.1.5:5100");
    assert.equal(targets[0].url, "http://192.168.1.5:8080/");
    assert.equal(serviceTargets("sai").at(-1).url, "http://localhost:11434/");
  });
});

describe("cảnh báo", () => {
  const base = { ov: overview(), err: null, services: [] };

  it("máy tắt mà có job chờ, chờ quá lâu, job lỗi 24 giờ", () => {
    const items = attentionItems(base, 0);
    assert.equal(items[0].level, "error");
    assert.match(items[0].html, /<strong>1 job<\/strong> đang chờ Máy AI/);
    assert.ok(items.some((i) => i.html.includes("Máy xử lý có thể đang quá tải")));
    assert.deepEqual(items.at(-1).action, { label: "Xem job lỗi", run: "failed" });
  });

  it("job quá hạn giữ chỗ khi đồng hồ chạy tiếp", () => {
    assert.ok(!attentionItems(base, 30).some((i) => i.html.includes("quá hạn")));
    assert.ok(attentionItems(base, 61).some((i) => i.html.includes("quá hạn giữ chỗ")));
  });

  it("dịch vụ bắt buộc tắt; lỗi API có nút mở cài đặt và được esc", () => {
    const services = [
      { name: "Gotenberg", required: true, up: false, affects: "Word sang PDF" },
      { name: "Ollama", required: false, up: false, affects: "AI" },
    ];
    const items = attentionItems({ ov: null, err: "<b>lỗi</b>", services }, 0);
    assert.equal(items[0].html, "&lt;b&gt;lỗi&lt;/b&gt;");
    assert.equal(items[0].action.run, "settings");
    assert.equal(items.length, 2); // Ollama không bắt buộc: không cảnh báo
  });
});

describe("máy xử lý, biểu đồ, con số", () => {
  it("dòng sức khoẻ", () => {
    const rows = healthRows({
      ov: overview(),
      err: null,
      settings: DEFAULTS,
      services: [{ name: "Stirling-PDF", up: true, required: true, millis: 12, affects: "PDF" }],
    });
    assert.equal(rows[0].sub, "Đang chạy ở localhost:5100");
    assert.equal(rows[1].sub, "Đang bật. Đang làm 1 job, 1 job chờ.");
    assert.equal(rows[2].ok, false);
    assert.equal(rows[2].warn, false); // máy AI tắt mà có job chờ: chấm đỏ
    assert.equal(rows[3].ms, "12 ms");
  });

  it("thời hạn giữ chỗ", () => {
    assert.deepEqual(leaseInfo({ leaseSecondsLeft: 60 }, 0), { left: 60, late: false, pct: 50 });
    assert.equal(leaseInfo({ leaseSecondsLeft: 60 }, 70).late, true);
    assert.equal(leaseInfo({ leaseSecondsLeft: null }, 0).left, null);
  });

  it("biểu đồ giữ 30 phút, toạ độ nằm trong khung", () => {
    let samples = addSample([], overview(), 0);
    samples = addSample(samples, overview({ totals: { pending: 5, processing: 2 } }), 60_000);
    assert.equal(chartData(samples.slice(0, 1)), null);
    const c = chartData(samples);
    assert.equal(c.peak, 5);
    assert.equal(c.minutes, 1);
    for (const p of c.wait.split(" ")) {
      const [x, y] = p.split(",").map(Number);
      assert.ok(x >= 0 && x <= c.width && y >= 0 && y <= c.height);
    }
    assert.equal(addSample(samples, overview(), SAMPLE_WINDOW_MS + 30_000).length, 2); // bỏ điểm đầu
  });

  it("con số chung", () => {
    const f = Object.fromEntries(facts(overview(), 5));
    assert.equal(f["Chờ lâu nhất"], "10 phút 5 giây");
    assert.equal(f["File đang lưu"], "12 file, 1,5 KB");
  });
});

describe("bảng", () => {
  const ov = overview();

  it("hàng chờ: tìm kiếm, đánh dấu máy tắt", () => {
    assert.deepEqual(
      queueRows(ov, "").map((j) => [j.id, j.workerOnline]),
      [
        ["w1", true],
        ["w2", false],
      ],
    );
    assert.deepEqual(
      queueRows(ov, "GHI-AM").map((j) => j.id),
      ["w2"],
    );
    assert.deepEqual(
      queueRows(ov, "transcribe").map((j) => j.id),
      ["w2"],
    ); // theo mã loại job
  });

  it("lịch sử lọc theo kết quả", () => {
    assert.equal(historyRows(ov, "all", "").length, 3);
    assert.deepEqual(
      historyRows(ov, "fail", "").map((j) => j.id),
      ["f1"],
    );
    assert.deepEqual(
      historyRows(ov, "cancel", "").map((j) => j.id),
      ["c1"],
    );
  });

  it("theo công cụ: đang có việc trước, ẩn công cụ chưa dùng", () => {
    // Nén PDF và Chép lời cùng có 1 job chờ: Nén PDF dùng nhiều hơn trong 24 giờ nên đứng trước.
    assert.deepEqual(
      toolRows(ov, "active", "").map((t) => t.type),
      ["compress-pdf", "transcribe-audio", "word-to-pdf"],
    );
    assert.equal(toolRows(ov, "all", "").length, 4);
  });
});

describe("ngăn chi tiết job", () => {
  const ov = overview();

  it("tìm job ở mọi danh sách", () => {
    assert.equal(findJob(ov, "r1").kind, "run");
    assert.equal(findJob(ov, "w1").kind, "wait");
    assert.equal(findJob(ov, "f1").kind, "fail");
    assert.equal(findJob(ov, "c1").kind, "cancel");
    assert.equal(findJob(ov, "khong-co"), null);
    assert.equal(findJob(null, "r1"), null);
  });

  it("thao tác được phép theo trạng thái", () => {
    assert.equal(jobAction("fail"), "retry");
    assert.equal(jobAction("cancel"), "retry");
    assert.equal(jobAction("wait"), "cancel");
    assert.equal(jobAction("run"), null);
    assert.equal(jobAction("done"), null);
  });

  it("thông tin chi tiết", () => {
    const rows = Object.fromEntries(jobDetails(findJob(ov, "f1"), 0));
    assert.equal(rows["Nguồn"], "App: Web ảnh");
    assert.equal(rows["Lô"], "<code>12345678</code>");
    assert.equal(rows["Số lượt"], "3");
    const wait = Object.fromEntries(jobDetails(findJob(ov, "w2"), 0));
    assert.equal(wait["Lượt trước"], "Bị dừng giữa chừng 1 lần");
  });
});
