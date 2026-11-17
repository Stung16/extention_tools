import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { loadForEdit } from "../pdfDocument";

// Các nhóm trang (số trang bắt đầu từ 1), mỗi nhóm thành một file.
//   mode "each"    mỗi trang một file
//   mode "every"   cứ `every` trang một file
//   mode "ranges"  theo khoảng tự chọn, ví dụ "1-3, 4-6, 8" -> 3 file
// Sai dữ liệu thì ném Error có câu tiếng Việt.
export function pageGroups(mode, pageCount, { every = "", ranges = "" } = {}) {
  if (mode === "each") return Array.from({ length: pageCount }, (_, i) => [i + 1]);

  if (mode === "every") {
    const n = Number(every);
    if (!Number.isInteger(n) || n < 1) throw new Error("Số trang mỗi file phải là số nguyên từ 1 trở lên.");
    const groups = [];
    for (let p = 1; p <= pageCount; p += n) groups.push(range(p, Math.min(p + n - 1, pageCount)));
    return groups;
  }

  const parts = ranges
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) throw new Error("Hãy nhập các khoảng trang, ví dụ: 1-3, 4-6, 8");
  return parts.map((part) => {
    const m = part.match(/^(\d+)\s*(?:-\s*(\d+))?$/);
    if (!m) throw new Error(`"${part}" không đúng dạng. Ví dụ đúng: 1-3, 4-6, 8`);
    const from = Number(m[1]);
    const to = m[2] ? Number(m[2]) : from;
    if (from < 1 || to > pageCount || to < from)
      throw new Error(`Khoảng "${part}" không hợp lệ (file có ${pageCount} trang).`);
    return range(from, to);
  });
}

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, k) => from + k);

// Tách PDF theo các nhóm trang. Trả về [{ name, bytes }], tên dạng "<tên gốc>-trang-1-3.pdf".
export async function splitPdf(bytes, groups, baseName) {
  const src = await loadForEdit(bytes);
  const outputs = [];
  for (const pages of groups) {
    const out = await PDFDocument.create();
    const copied = await out.copyPages(
      src,
      pages.map((p) => p - 1),
    );
    copied.forEach((p) => out.addPage(p));
    const label = pages.length === 1 ? `trang-${pages[0]}` : `trang-${pages[0]}-${pages[pages.length - 1]}`;
    outputs.push({ name: `${baseName}-${label}.pdf`, bytes: await out.save() });
  }
  return outputs;
}

// Một file thì trả thẳng file đó; nhiều file thì gói vào một file .zip.
// Trả về { name, bytes, type }.
export async function bundleOutputs(outputs, zipName) {
  if (outputs.length === 1) return { ...outputs[0], type: "application/pdf" };
  const zip = new JSZip();
  outputs.forEach((o) => zip.file(o.name, o.bytes));
  return { name: zipName, bytes: await zip.generateAsync({ type: "uint8array" }), type: "application/zip" };
}
