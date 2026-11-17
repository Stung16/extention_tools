import { PDFCheckBox, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFTextField } from "pdf-lib";
import { embedVietFont, loadForEdit } from "../pdfDocument";

// Đọc các ô biểu mẫu có trong PDF.
//   trả về [{ name, kind: "text" | "check" | "select", value, multiline?, options? }]
//   (ô loại khác như nút bấm, ô chữ ký số thì bỏ qua)
export async function readFormFields(bytes) {
  const doc = await loadForEdit(bytes);
  return doc.getForm().getFields().map(describeField).filter(Boolean);
}

function describeField(field) {
  const name = field.getName();
  if (field instanceof PDFTextField)
    return { name, kind: "text", value: field.getText() || "", multiline: field.isMultiline() };
  if (field instanceof PDFCheckBox) return { name, kind: "check", value: field.isChecked() };
  if (field instanceof PDFDropdown || field instanceof PDFOptionList)
    return { name, kind: "select", value: field.getSelected()[0] || "", options: field.getOptions() };
  if (field instanceof PDFRadioGroup)
    return { name, kind: "select", value: field.getSelected() || "", options: field.getOptions() };
  return null;
}

// Cỡ chữ theo chiều cao ô: cỡ tự động của pdf-lib quá to với phông có dấu, làm mất phần dưới chữ
// (dấu nặng, chân chữ g, y). Lấy nửa chiều cao ô, trong khoảng 7..14.
export function fontSizeForHeight(height) {
  return Math.max(7, Math.min(14, Math.round(height * 0.5)));
}

const heightOf = (field) => field.acroField.getWidgets()[0]?.getRectangle().height ?? 20;

// Điền giá trị vào các ô rồi lưu.
//   fields     như readFormFields trả về, với value mới
//   fontBytes  phông tiếng Việt (loadVietFont())
//   flatten    biến chữ đã điền thành nội dung cố định, không sửa được nữa
export async function fillForm(bytes, fields, { fontBytes, flatten = false }) {
  const doc = await loadForEdit(bytes);
  const form = doc.getForm();
  for (const f of fields) {
    const field = form.getField(f.name);
    if (f.kind === "text") {
      field.setText(f.value);
      if (!f.multiline) field.setFontSize(fontSizeForHeight(heightOf(field)));
    } else if (f.kind === "check") {
      if (f.value) field.check();
      else field.uncheck();
    } else if (f.kind === "select" && f.value) {
      field.select(f.value);
      // Ô chọn dạng danh sách cũng tự đặt cỡ chữ (ô dạng nút tròn không có setFontSize).
      if (typeof field.setFontSize === "function") field.setFontSize(fontSizeForHeight(heightOf(field)));
    }
  }
  // Vẽ lại hình các ô bằng phông có tiếng Việt, rồi lưu KHÔNG cho pdf-lib vẽ lại bằng phông mặc định.
  form.updateFieldAppearances(await embedVietFont(doc, fontBytes));
  if (flatten) form.flatten();
  return doc.save({ updateFieldAppearances: false });
}
