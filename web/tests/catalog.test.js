// Danh mục công cụ: dữ liệu đúng, khớp với API (JobCatalog.cs) và với danh sách công cụ trình duyệt.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CATEGORIES } from "@/catalog/categories";
import { ALL_TOOLS, findTool, isToolReady, nextSuggestions, relatedTools, searchCatalog } from "@/catalog/queries";
import { CLIENT_TOOLS } from "@/features/clientTools";

const JOB_CATALOG = new URL("../../api/src/CongCuFile.Domain/Catalog/JobCatalog.cs", import.meta.url);
const apiJobTypes = () =>
  new Set([...readFileSync(JOB_CATALOG, "utf8").matchAll(/\["([a-z0-9-]+)"\] = new\(/g)].map((m) => m[1]));

describe("dữ liệu danh mục", () => {
  it("slug và id nhóm không trùng nhau", () => {
    const slugs = ALL_TOOLS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    const ids = CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("mỗi công cụ có đủ tên, mô tả, biểu tượng; slug viết thường không dấu", () => {
    for (const t of ALL_TOOLS) {
      expect(t.name && t.desc && t.icon, t.slug).toBeTruthy();
      expect(t.slug).toMatch(/^[a-z0-9-]+$/);
      expect(t.job && t.client, `${t.slug} không được có cả job lẫn client`).toBeFalsy();
    }
  });

  it("loại job nào cũng có trong JobCatalog.cs của API", () => {
    const known = apiJobTypes();
    const missing = ALL_TOOLS.filter((t) => t.job && !known.has(t.job)).map((t) => t.job);
    expect(missing).toEqual([]);
    expect(known.has("trim-video")).toBe(true); // công cụ Cắt video gửi job này
  });

  it("công cụ trình duyệt nào cũng có trong clientTools.js", () => {
    const missing = ALL_TOOLS.filter((t) => t.client && !CLIENT_TOOLS[t.client]).map((t) => t.client);
    expect(missing).toEqual([]);
  });

  it("câu hỏi thường gặp đúng dạng [câu hỏi, trả lời]", () => {
    for (const t of ALL_TOOLS) for (const item of t.faq || []) expect(item).toHaveLength(2);
  });
});

describe("tra cứu", () => {
  const jobTypes = { "compress-pdf": {}, "word-to-pdf": {} };
  const isReady = (t) => isToolReady(t, jobTypes);

  it("findTool", () => {
    expect(findTool("nen-pdf").job).toBe("compress-pdf");
    expect(findTool("nen-pdf").category.id).toBe("sua-pdf");
    expect(findTool("khong-co")).toBeNull();
  });

  it("dùng được khi chạy trên trình duyệt hoặc API hỗ trợ job", () => {
    expect(isReady(findTool("gop-pdf"))).toBe(true); // client
    expect(isReady(findTool("nen-pdf"))).toBe(true); // API có
    expect(isReady(findTool("ocr-pdf"))).toBe(false); // API không có
  });

  it("tìm không phân biệt dấu, nhóm không còn công cụ thì bỏ", () => {
    const sections = searchCatalog("nen video", isReady);
    expect(sections.map((s) => s.category.id)).toEqual(["am-thanh-video"]);
    expect(sections[0].tools.map((t) => t.slug)).toEqual(["nen-video"]);
    expect(searchCatalog("", isReady)).toHaveLength(CATEGORIES.length);
    expect(searchCatalog("xyz khong co", isReady)).toEqual([]);
  });

  it("công cụ dùng được xếp trước", () => {
    const tools = searchCatalog("", isReady).find((s) => s.category.id === "sang-pdf").tools;
    expect(tools[0].slug).toBe("word-sang-pdf");
    expect(isReady(tools.at(-1))).toBe(false);
  });

  it("công cụ cùng nhóm không gồm chính nó", () => {
    const tool = findTool("nen-pdf");
    const related = relatedTools(tool, isReady);
    expect(related.length).toBeLessThanOrEqual(8);
    expect(related.every((t) => t.category.id === "sua-pdf" && t.slug !== "nen-pdf")).toBe(true);
  });

  it("chuyển sang PDF xong thì gợi ý nén PDF trước", () => {
    const list = nextSuggestions(findTool("word-sang-pdf"), isReady);
    expect(list[0].slug).toBe("nen-pdf");
    expect(list.length).toBeLessThanOrEqual(3);
  });
});
