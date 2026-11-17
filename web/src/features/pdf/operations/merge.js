import { PDFDocument } from "pdf-lib";
import { loadForEdit } from "../pdfDocument";

// Gộp nhiều PDF thành một, theo đúng thứ tự.
//   sources  [{ name, bytes }]
//   trả về   { bytes, pageCount }
export async function mergePdfs(sources) {
  const out = await PDFDocument.create();
  for (const { name, bytes } of sources) {
    let src;
    try {
      src = await loadForEdit(bytes);
    } catch (e) {
      throw new Error(`"${name}": ${e.message}`); // báo rõ file nào hỏng
    }
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  return { bytes: await out.save(), pageCount: out.getPageCount() };
}
