// Công cụ xử lý trên máy chủ: kiểm tra trước khi gửi, tạo form, đổi trạng thái job, gọi API.
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJobTypes, getJob } from "@/api/jobsApi";
import { errorOf, phaseOf, savedPercent, SLOW_WAIT_SECONDS, waitNotice } from "@/features/server-jobs/jobProgress";
import {
  buildJobForm,
  checkRequest,
  checkValues,
  defaultValues,
  withoutPasswords,
} from "@/features/server-jobs/jobRequest";

// Giống tuỳ chọn API trả về (JobCatalog.cs).
const LEVEL = {
  name: "level",
  label: "Mức nén",
  choices: [
    { value: "low", label: "Nhẹ" },
    { value: "medium", label: "Vừa" },
  ],
  default: "medium",
};
const PAGES = {
  name: "pages",
  label: "Các trang",
  kind: "text",
  required: true,
  maxLength: 20,
  pattern: "^[0-9,-]+$",
  hint: "Ví dụ: 1,3-5",
};
const PASSWORD = { name: "password", label: "Mật khẩu", kind: "password", required: true, maxLength: 50 };

describe("tuỳ chọn", () => {
  it("giá trị ban đầu: lựa chọn mặc định, ô nhập trống", () => {
    expect(defaultValues([LEVEL, PAGES])).toEqual({ level: "medium", pages: "" });
    expect(defaultValues()).toEqual({});
  });

  it("báo thiếu ô bắt buộc, quá dài, sai dạng", () => {
    expect(checkValues([PAGES], { pages: "  " })).toBe("Vui lòng nhập: Các trang.");
    expect(checkValues([PAGES], { pages: "1".repeat(21) })).toBe("Các trang: tối đa 20 ký tự.");
    expect(checkValues([PAGES], { pages: "1;2" })).toBe("Các trang không đúng dạng. Ví dụ: 1,3-5");
    expect(checkValues([PAGES, LEVEL], { pages: " 1,3-5 ", level: "low" })).toBe("");
  });

  it("mật khẩu chỉ có dấu cách vẫn tính là đã nhập", () => {
    expect(checkValues([PASSWORD], { password: "  " })).toBe("");
    expect(checkValues([PASSWORD], { password: "" })).toBe("Vui lòng nhập: Mật khẩu.");
  });

  it("xoá mật khẩu, giữ tuỳ chọn khác", () => {
    expect(withoutPasswords([LEVEL, PASSWORD], { level: "low", password: "bi-mat" })).toEqual({
      level: "low",
      password: "",
    });
  });
});

describe("yêu cầu", () => {
  const file = new File(["%PDF"], "a.pdf");

  it("cần file / link hợp lệ", () => {
    expect(checkRequest({ input: "file" }, { file: null, url: "" }, {})).toBe("Vui lòng chọn file.");
    expect(checkRequest({ input: "url" }, { file: null, url: " " }, {})).toBe("Vui lòng dán đường link.");
    const yt = { input: "url", urlPattern: "^https://(www\\.)?youtube\\.com/" };
    expect(checkRequest(yt, { url: "https://evil.example/" }, {})).toBe("Đường link không hợp lệ cho công cụ này.");
    expect(checkRequest(yt, { url: "https://youtube.com/watch?v=1" }, {})).toBe("");
    expect(checkRequest({ input: "none", options: [] }, { file: null, url: "" }, {})).toBe("");
  });

  it("form gửi đúng trường, ô trống không gửi", () => {
    const form = buildJobForm(
      "compress-pdf",
      { options: [LEVEL, PAGES] },
      { file, url: "" },
      { level: "low", pages: "" },
    );
    expect(form.get("type")).toBe("compress-pdf");
    expect(form.get("file").name).toBe("a.pdf");
    expect(form.get("level")).toBe("low");
    expect(form.has("pages")).toBe(false);
    expect(form.has("url")).toBe(false);
  });

  it("job dạng link gửi url, không gửi file", () => {
    const form = buildJobForm("transcribe-youtube", { input: "url" }, { file: null, url: " https://youtu.be/x " }, {});
    expect(form.get("url")).toBe("https://youtu.be/x");
    expect(form.has("file")).toBe(false);
  });
});

describe("trạng thái job", () => {
  it("đổi trạng thái API sang giai đoạn trên trang", () => {
    expect(["Pending", "Processing", "Done", "Failed", "Cancelled"].map((status) => phaseOf({ status }))).toEqual([
      "waiting",
      "processing",
      "done",
      "error",
      "error",
    ]);
    expect(errorOf({ status: "Failed", error: "Sai mật khẩu PDF." })).toBe("Sai mật khẩu PDF.");
    expect(errorOf({ status: "Cancelled" })).toBe("Yêu cầu đã bị huỷ.");
  });

  it("báo khi máy xử lý tắt hoặc chờ lâu", () => {
    expect(waitNotice({ phase: "waiting", job: { workerOnline: false }, waited: 1 })).toMatch(/đang tắt/);
    expect(waitNotice({ phase: "waiting", job: {}, waited: SLOW_WAIT_SECONDS + 1 })).toMatch(/Chờ hơi lâu/);
    expect(waitNotice({ phase: "waiting", job: {}, waited: 1 })).toBe("");
    expect(waitNotice({ phase: "processing", job: { workerOnline: false } })).toBe("");
  });

  it("phần trăm giảm dung lượng", () => {
    expect(savedPercent({ inputSize: 1000, outputSize: 250 })).toBe(75);
    expect(savedPercent({ inputSize: 1000, outputSize: 1200 })).toBe(0);
    expect(savedPercent({ outputSize: 5 })).toBe(0);
  });
});

describe("gọi API", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("danh sách loại job thành bảng tra theo tên", async () => {
    vi.stubGlobal("fetch", async () => Response.json([{ type: "compress-pdf", online: true }]));
    expect(await fetchJobTypes()).toEqual({ "compress-pdf": { type: "compress-pdf", online: true } });
  });

  it("API tắt thì trả danh sách rỗng, không lỗi", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await fetchJobTypes()).toEqual({});
    vi.stubGlobal("fetch", async () => new Response("lỗi", { status: 502 }));
    expect(await fetchJobTypes()).toEqual({});
  });

  it("không xem được trạng thái thì báo lỗi có mã", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 404 }));
    await expect(getJob("x")).rejects.toThrow("Không xem được trạng thái (404).");
  });
});
