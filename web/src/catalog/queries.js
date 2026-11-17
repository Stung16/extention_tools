// Các hàm tra cứu danh mục công cụ. Hàm thuần (không gọi mạng, không React) nên test được dễ dàng.
//   jobTypes: danh sách loại job API đang hỗ trợ, dạng { "compress-pdf": {...} } (xem api/jobsApi.js).

import { toSearchText } from "@/shared/lib/search";
import { CATEGORIES } from "./categories";

// Mọi công cụ, mỗi công cụ có thêm trường `category` (nhóm chứa nó).
export const ALL_TOOLS = CATEGORIES.flatMap((category) => category.tools.map((tool) => ({ ...tool, category })));

export function findTool(slug) {
  return ALL_TOOLS.find((t) => t.slug === slug) ?? null;
}

// Công cụ dùng được khi: chạy trên trình duyệt, hoặc API có hỗ trợ loại job của nó.
export function isToolReady(tool, jobTypes) {
  return Boolean(tool.client || (tool.job && jobTypes[tool.job]));
}

// Công cụ dùng được xếp lên trước (giữ nguyên thứ tự trong cùng một loại).
const readyFirst = (isReady) => (a, b) => Number(isReady(b)) - Number(isReady(a));

// Các nhóm công cụ khớp ô tìm kiếm (không phân biệt dấu, hoa thường). Nhóm không còn công cụ nào thì bỏ.
export function searchCatalog(query, isReady) {
  const q = toSearchText(query.trim());
  return ALL_TOOLS.reduce((sections, tool) => {
    if (q && !toSearchText(tool.name + " " + tool.desc).includes(q)) return sections;
    let section = sections.find((s) => s.category === tool.category);
    if (!section) sections.push((section = { category: tool.category, tools: [] }));
    section.tools.push(tool);
    return sections;
  }, []).map((s) => ({ ...s, tools: s.tools.sort(readyFirst(isReady)) }));
}

// Các công cụ khác cùng nhóm (cho phần "Công cụ khác trong nhóm").
export function relatedTools(tool, isReady, limit = 8) {
  return ALL_TOOLS.filter((t) => t.category.id === tool.category.id && t.slug !== tool.slug)
    .sort(readyFirst(isReady))
    .slice(0, limit);
}

// Gợi ý làm tiếp sau khi xong: kết quả là PDF thì gợi ý nén; thêm vài công cụ dùng được cùng nhóm.
export function nextSuggestions(tool, isReady, limit = 3) {
  const compress = ALL_TOOLS.find((t) => t.job === "compress-pdf");
  const list = tool.category.id === "sang-pdf" && compress && isReady(compress) ? [compress] : [];
  for (const t of ALL_TOOLS) {
    if (t.category.id === tool.category.id && t.slug !== tool.slug && isReady(t)) list.push(t);
  }
  return list.slice(0, limit);
}
