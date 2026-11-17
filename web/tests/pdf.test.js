// Công cụ PDF chạy trên trình duyệt: thử trên file PDF thật do pdf-lib tạo ra ngay trong test.
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { PDFDict, PDFDocument, PDFName, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { countObjects, removeObject, updateObject, addObject } from "@/features/pdf/editor/pageObjects";
import { writeAnnotations } from "@/features/pdf/editor/writeAnnotations";
import { cropPdf, cropRect, toFractions } from "@/features/pdf/operations/crop";
import { fillForm, fontSizeForHeight, readFormFields } from "@/features/pdf/operations/fillForm";
import { mergePdfs } from "@/features/pdf/operations/merge";
import { organizePages } from "@/features/pdf/operations/organize";
import { bundleOutputs, pageGroups, splitPdf } from "@/features/pdf/operations/split";
import { loadForEdit } from "@/features/pdf/pdfDocument";

const FONT = readFileSync(new URL("../public/fonts/BeVietnamPro-Regular.ttf", import.meta.url));

// PDF có các trang rộng khác nhau (100, 200, 300...) để nhận ra trang nào là trang nào.
async function makePdf(pageCount, { height = 400 } = {}) {
  const doc = await PDFDocument.create();
  for (let i = 1; i <= pageCount; i++) doc.addPage([i * 100, height]);
  return doc.save();
}
const widths = async (bytes) => (await PDFDocument.load(bytes)).getPages().map((p) => p.getWidth());

describe("gộp", () => {
  it("ghép đúng thứ tự", async () => {
    const { bytes, pageCount } = await mergePdfs([
      { name: "a.pdf", bytes: await makePdf(2) },
      { name: "b.pdf", bytes: await makePdf(1) },
    ]);
    expect(pageCount).toBe(3);
    expect(await widths(bytes)).toEqual([100, 200, 100]);
  });

  it("báo rõ file nào hỏng", async () => {
    await expect(mergePdfs([{ name: "hong.pdf", bytes: new TextEncoder().encode("khong phai pdf") }])).rejects.toThrow(
      '"hong.pdf": Không đọc được file PDF để sửa.',
    );
  });
});

describe("tách", () => {
  it("chia nhóm trang theo từng cách", () => {
    expect(pageGroups("each", 3)).toEqual([[1], [2], [3]]);
    expect(pageGroups("every", 5, { every: "2" })).toEqual([[1, 2], [3, 4], [5]]);
    expect(pageGroups("ranges", 8, { ranges: "1-3, 8 ,5-5" })).toEqual([[1, 2, 3], [8], [5]]);
  });

  it("báo lỗi dữ liệu sai bằng tiếng Việt", () => {
    expect(() => pageGroups("every", 5, { every: "0" })).toThrow("Số trang mỗi file");
    expect(() => pageGroups("ranges", 5, { ranges: "" })).toThrow("Hãy nhập các khoảng trang");
    expect(() => pageGroups("ranges", 5, { ranges: "1-a" })).toThrow('"1-a" không đúng dạng');
    expect(() => pageGroups("ranges", 5, { ranges: "4-9" })).toThrow("file có 5 trang");
    expect(() => pageGroups("ranges", 5, { ranges: "3-1" })).toThrow("không hợp lệ");
  });

  it("tách ra file đúng trang và đúng tên, nhiều file thì gói zip", async () => {
    const outputs = await splitPdf(await makePdf(3), [[1, 2], [3]], "bao-cao");
    expect(outputs.map((o) => o.name)).toEqual(["bao-cao-trang-1-2.pdf", "bao-cao-trang-3.pdf"]);
    expect(await widths(outputs[0].bytes)).toEqual([100, 200]);

    const zip = await bundleOutputs(outputs, "bao-cao-da-tach.zip");
    expect(zip.name).toBe("bao-cao-da-tach.zip");
    expect(Object.keys((await JSZip.loadAsync(zip.bytes)).files)).toEqual(outputs.map((o) => o.name));

    const single = await bundleOutputs(outputs.slice(0, 1), "x.zip");
    expect(single).toMatchObject({ name: "bao-cao-trang-1-2.pdf", type: "application/pdf" });
  });
});

describe("sắp xếp trang", () => {
  it("đổi thứ tự, bỏ trang, xoay thêm", async () => {
    const bytes = await organizePages(await makePdf(3), [
      { n: 3, rotate: 90 },
      { n: 1, rotate: 0 },
    ]);
    const pages = (await PDFDocument.load(bytes)).getPages();
    expect(pages.map((p) => p.getWidth())).toEqual([300, 100]);
    expect(pages.map((p) => p.getRotation().angle)).toEqual([90, 0]);
  });
});

describe("cắt lề", () => {
  it("đổi khung trên màn hình sang toạ độ PDF (trục dọc ngược chiều)", () => {
    // Trang xem rộng 200x400 điểm ảnh, kéo khung từ (20, 40) rộng 100 cao 200.
    const f = toFractions({ x: 20, y: 40, w: 100, h: 200 }, { width: 200, height: 400 });
    expect(f).toEqual({ fx: 0.1, fy: 0.1, fw: 0.5, fh: 0.5 });
    // Trang PDF 600x800: lề trái 60, lề DƯỚI = 800 * (1 - 0.1 - 0.5) = 320.
    expect(cropRect({ x: 0, y: 0, width: 600, height: 800 }, f)).toEqual({ x: 60, y: 320, width: 300, height: 400 });
  });

  it("áp dụng cho mọi trang hoặc một trang", async () => {
    const f = { fx: 0, fy: 0, fw: 0.5, fh: 0.5 };
    const all = (await PDFDocument.load(await cropPdf(await makePdf(2), f))).getPages();
    expect(all.map((p) => p.getCropBox().width)).toEqual([50, 100]);
    const one = (await PDFDocument.load(await cropPdf(await makePdf(2), f, 2))).getPages();
    expect(one.map((p) => p.getCropBox().width)).toEqual([100, 100]);
  });
});

describe("điền biểu mẫu", () => {
  async function makeForm() {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 300]);
    const form = doc.getForm();
    form.createTextField("ho_ten").addToPage(page, { x: 20, y: 200, width: 300, height: 24 });
    form.createCheckBox("dong_y").addToPage(page, { x: 20, y: 150, width: 16, height: 16 });
    const city = form.createDropdown("thanh_pho");
    city.addOptions(["Hà Nội", "Huế"]);
    city.addToPage(page, { x: 20, y: 100, width: 200, height: 24 });
    // Ô có sẵn giá trị dùng phông thường; khi điền chữ Việt phải đổi sang phông nhúng.
    form.updateFieldAppearances(await doc.embedFont(StandardFonts.Helvetica));
    return doc.save();
  }

  it("đọc được các ô", async () => {
    const fields = await readFormFields(await makeForm());
    expect(fields.map((f) => [f.name, f.kind])).toEqual([
      ["ho_ten", "text"],
      ["dong_y", "check"],
      ["thanh_pho", "select"],
    ]);
    expect(fields[2].options).toEqual(["Hà Nội", "Huế"]);
  });

  it("điền chữ tiếng Việt có dấu, tự đặt cỡ chữ theo chiều cao ô", async () => {
    const bytes = await makeForm();
    const fields = await readFormFields(bytes);
    fields[0].value = "Nguyễn Thị Hằng";
    fields[1].value = true;
    fields[2].value = "Huế";
    const filled = await fillForm(bytes, fields, { fontBytes: FONT });

    const form = (await PDFDocument.load(filled)).getForm();
    expect(form.getTextField("ho_ten").getText()).toBe("Nguyễn Thị Hằng");
    expect(form.getCheckBox("dong_y").isChecked()).toBe(true);
    expect(form.getDropdown("thanh_pho").getSelected()).toEqual(["Huế"]);
    expect(fontSizeForHeight(24)).toBe(12);
    expect(fontSizeForHeight(100)).toBe(14);
    expect(fontSizeForHeight(4)).toBe(7);
  });

  it("khoá nội dung: không còn ô để sửa", async () => {
    const bytes = await makeForm();
    const fields = await readFormFields(bytes);
    fields[0].value = "Trần Văn Đức";
    const filled = await fillForm(bytes, fields, { fontBytes: FONT, flatten: true });
    expect((await PDFDocument.load(filled)).getForm().getFields()).toHaveLength(0);
  });
});

describe("trình sửa PDF", () => {
  // Viewport giả giống pdf.js: trang 200x400 đơn vị PDF hiện ở tỉ lệ 2 (400x800 điểm ảnh), trục dọc ngược chiều.
  const viewport = { scale: 2, convertToPdfPoint: (x, y) => [x / 2, 400 - y / 2] };
  // Ảnh PNG 1x1 điểm ảnh.
  const PNG =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

  it("thêm, sửa, xoá vật thể trên từng trang", () => {
    let objects = addObject({}, 1, { id: 1, type: "text", text: "a" });
    objects = addObject(objects, 2, { id: 2, type: "draw", points: [[0, 0]] });
    objects = updateObject(objects, 1, 1, { text: "b" });
    objects = updateObject(objects, 2, 2, (o) => ({ points: [...o.points, [1, 1]] }));
    expect(objects[1][0].text).toBe("b");
    expect(objects[2][0].points).toHaveLength(2);
    expect(countObjects(removeObject(objects, 1, 1))).toBe(1);
  });

  it("vẽ chữ Việt, tô sáng, che trắng, nét bút, ảnh vào PDF", async () => {
    const objects = {
      1: [
        { id: 1, type: "text", x: 20, y: 20, text: "Đã duyệt\nNgày 17", size: 16, color: "#c0262d" },
        { id: 2, type: "highlight", x: 10, y: 100, w: 200, h: 30 },
        { id: 3, type: "whiteout", x: 10, y: 200, w: 100, h: 40 },
        {
          id: 4,
          type: "draw",
          points: [
            [0, 0],
            [50, 50],
            [100, 20],
          ],
          color: "#111111",
          width: 2.5,
        },
        { id: 5, type: "image", x: 100, y: 300, w: 80, h: 40, src: PNG },
      ],
    };
    let fontLoads = 0;
    const loadFont = async () => (fontLoads++, FONT);
    const bytes = await writeAnnotations(await makePdf(1, { height: 400 }), objects, { 1: viewport }, { loadFont });

    expect(fontLoads).toBe(1);
    const doc = await loadForEdit(bytes);
    expect(doc.getPageCount()).toBe(1);
    // Đã nhúng phông tiếng Việt (chỉ phần chữ có dùng) và ảnh.
    const dicts = doc.context
      .enumerateIndirectObjects()
      .map(([, obj]) => (obj instanceof PDFDict ? obj : obj.dict))
      .filter(Boolean);
    const fontNames = dicts.map((d) => d.get(PDFName.of("FontName"))?.toString()).filter(Boolean);
    expect(fontNames.some((n) => n.includes("BeVietnamPro"))).toBe(true);
    expect(dicts.some((d) => d.get(PDFName.of("Subtype")) === PDFName.of("Image"))).toBe(true);
  });

  it("không có chữ thì không tải phông", async () => {
    const objects = { 1: [{ id: 1, type: "whiteout", x: 0, y: 0, w: 50, h: 50 }] };
    const loadFont = () => {
      throw new Error("không được gọi");
    };
    await expect(writeAnnotations(await makePdf(1), objects, { 1: viewport }, { loadFont })).resolves.toBeInstanceOf(
      Uint8Array,
    );
  });
});
