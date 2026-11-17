// Hàm dùng chung: định dạng, tìm kiếm, kiểm tra file, nội dung trang công cụ, bố cục gộp ảnh, chữ ký.
import { describe, expect, it } from "vitest";
import { findTool } from "@/catalog/queries";
import { mergeLayout } from "@/features/image/mergeLayout";
import { inkBounds } from "@/features/pdf/editor/inkBounds";
import { faqItems, howToSteps } from "@/pages/tool-page/toolHelp";
import { checkFiles, extOf, MAX_UPLOAD_MB, stemOf } from "@/shared/lib/files";
import { formatClock, formatSize } from "@/shared/lib/format";
import { rectBetween } from "@/shared/lib/pointer";
import { toSearchText } from "@/shared/lib/search";

describe("định dạng", () => {
  it("dung lượng kiểu Việt Nam", () => {
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(5770758)).toBe("5,5 MB");
    expect(formatSize(150 * 1024 * 1024)).toBe("150 MB");
    expect(formatSize(null)).toBe("");
  });

  it("thời gian phút:giây", () => {
    expect(formatClock(3.5)).toBe("0:03.5");
    expect(formatClock(75.5)).toBe("1:15.5");
  });

  it("bỏ dấu để tìm kiếm", () => {
    expect(toSearchText("Đổi định dạng ẢNH")).toBe("doi dinh dang anh");
    expect(toSearchText("Nén PDF")).toBe("nen pdf");
  });
});

describe("file", () => {
  it("đuôi và tên", () => {
    expect(extOf("Báo cáo.PDF")).toBe(".pdf");
    expect(extOf("khong-duoi")).toBe("");
    expect(stemOf("bao.cao.pdf")).toBe("bao.cao");
    expect(stemOf(".env")).toBe(".env");
  });

  it("báo sai loại, quá lớn", () => {
    const pdf = { name: "a.pdf", size: 10 };
    expect(checkFiles([pdf], [".pdf"], MAX_UPLOAD_MB)).toBe("");
    expect(checkFiles([{ name: "a.docx", size: 1 }], [".pdf"], 100)).toMatch(/không đúng loại/);
    expect(checkFiles([{ name: "a.pdf", size: 101 * 1024 * 1024 }], [".pdf"], 100)).toMatch(/quá lớn. Tối đa 100 MB/);
    expect(checkFiles([{ name: "a.pdf", size: 10 ** 10 }], [".pdf"], null)).toBe(""); // công cụ trình duyệt
  });

  it("khung từ hai điểm, kéo theo chiều nào cũng được", () => {
    expect(rectBetween({ x: 50, y: 40 }, { x: 10, y: 60 })).toEqual({ x: 10, y: 40, w: 40, h: 20 });
  });
});

describe("trang công cụ", () => {
  it("cách dùng theo loại công cụ", () => {
    expect(howToSteps(findTool("gop-pdf"), null)[1]).toMatch(/trình duyệt/);
    const steps = howToSteps(findTool("nen-pdf"), { extensions: [".pdf"], options: [{}] });
    expect(steps[0]).toContain("(.pdf...)");
    expect(steps[1]).toMatch(/tuỳ chọn/);
    expect(howToSteps(findTool("van-ban-sang-giong-noi"), { input: "none" })[2]).toMatch(/nghe thử/);
  });

  it("câu hỏi chung: giới hạn file chỉ hiện với công cụ máy chủ", () => {
    const server = faqItems(findTool("nen-pdf"), { extensions: [".pdf"] }).map(([q]) => q);
    expect(server).toContain("File tối đa bao nhiêu?");
    expect(server).toContain("File của tôi được giữ trên máy chủ bao lâu?");
    expect(server[0]).toBe("Nén có làm mờ chữ không?"); // câu riêng đứng trước
    const client = faqItems(findTool("gop-pdf"), null).map(([q]) => q);
    expect(client).not.toContain("File tối đa bao nhiêu?");
    expect(client).not.toContain("File của tôi được giữ trên máy chủ bao lâu?"); // file không lên máy chủ
  });
});

describe("gộp ảnh", () => {
  it("ghép dọc: cùng chiều rộng bằng ảnh rộng nhất, có khoảng cách", () => {
    const l = mergeLayout(
      [
        { width: 200, height: 100 },
        { width: 100, height: 100 },
      ],
      "vertical",
      10,
    );
    expect(l).toMatchObject({ width: 200, height: 100 + 10 + 200, scale: 1 });
    expect(l.places[1]).toEqual({ x: 0, y: 110, w: 200, h: 200 });
  });

  it("ghép ngang và thu nhỏ khi quá lớn", () => {
    const l = mergeLayout(
      [
        { width: 100, height: 50 },
        { width: 100, height: 100 },
      ],
      "horizontal",
      0,
      150,
    );
    // Cùng cao 100: ảnh 1 rộng 200, ảnh 2 rộng 100 -> 300x100, thu nhỏ một nửa.
    expect(l).toMatchObject({ width: 150, height: 50, scale: 0.5 });
    expect(l.places[1]).toEqual({ x: 100, y: 0, w: 50, h: 50 });
    expect(mergeLayout([], "vertical", 0)).toBeNull();
  });
});

describe("chữ ký", () => {
  it("cắt sát phần có nét", () => {
    const w = 10;
    const h = 8;
    const data = new Uint8ClampedArray(w * h * 4);
    const ink = (x, y) => (data[(y * w + x) * 4 + 3] = 255);
    ink(2, 3);
    ink(5, 4);
    expect(inkBounds(data, w, h, 1)).toEqual({ x: 1, y: 2, w: 6, h: 4 });
    expect(inkBounds(new Uint8ClampedArray(w * h * 4), w, h)).toBeNull();
  });
});
