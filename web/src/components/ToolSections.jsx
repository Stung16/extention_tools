import ToolCard from "./ToolCard";
import { MAX_UPLOAD_MB } from "./FileDrop";

// Các phần bên dưới trang công cụ: cách dùng, câu hỏi thường gặp, công cụ cùng nhóm.

export function HowTo({ tool, type }) {
  const exts = type?.extensions?.slice(0, 4).join(", ");
  const steps = tool.client
    ? ["Chọn hoặc kéo thả file vào khung phía trên.", "Thao tác trực tiếp trên trang: mọi thứ chạy ngay trên trình duyệt của bạn.", "Bấm nút lưu để tải file kết quả về máy."]
    : type?.input === "none"
      ? ["Gõ hoặc dán nội dung vào ô phía trên.", "Chọn tuỳ chọn phù hợp, rồi bấm nút xử lý.", "Chờ tới khi báo \"Xong!\", nghe thử rồi tải về máy."]
    : type?.input === "url"
      ? ["Dán đường link vào ô phía trên.", type?.options?.length ? "Chọn tuỳ chọn phù hợp, rồi bấm nút xử lý." : `Bấm nút "${tool.name}".`, "Chờ tới khi báo \"Xong!\", rồi tải kết quả về máy."]
      : [`Bấm "Chọn file" hoặc kéo thả file${exts ? ` (${exts}...)` : ""} vào khung phía trên.`,
        type?.options?.length ? "Chọn tuỳ chọn phù hợp, rồi bấm nút xử lý." : `Bấm nút "${tool.name}" để bắt đầu.`,
        "Chờ tới khi báo \"Xong!\", rồi tải file kết quả về máy."];
  return (
    <section className="section">
      <h2>Cách dùng công cụ {tool.name}</h2>
      <div className="steps">{steps.map((s) => <div className="step" key={s}><p>{s}</p></div>)}</div>
    </section>
  );
}

export function Faq({ tool, type }) {
  const items = [...(tool.faq || [])];
  if (type?.extensions?.length) items.push(["Công cụ nhận những loại file nào?", type.extensions.join(", ")]);
  items.push(["Công cụ này có mất phí không?", "Hiện tại bạn dùng miễn phí."]);
  if (!tool.client) {
    items.push(["File tối đa bao nhiêu?", `Mỗi file tối đa ${MAX_UPLOAD_MB} MB.`]);
    items.push(["File của tôi được xử lý ở đâu?", "File được gửi lên máy chủ của chúng tôi để xử lý bằng phần mềm mã nguồn mở, không gửi cho bên thứ ba."]);
  }
  return (
    <section className="section">
      <h2>Câu hỏi thường gặp</h2>
      <div className="faq">
        {items.map(([q, a]) => (
          <details key={q}><summary>{q}</summary><p>{a}</p></details>
        ))}
      </div>
    </section>
  );
}

export function Related({ tool, isReady }) {
  const others = tool.category.tools
    .filter((t) => t.slug !== tool.slug)
    .map((t) => ({ ...t, category: tool.category }))
    .sort((a, b) => Number(isReady(b)) - Number(isReady(a)))
    .slice(0, 8);
  return (
    <section className="section">
      <h2>Công cụ khác trong nhóm "{tool.category.name}"</h2>
      <div className="grid">{others.map((t) => <ToolCard key={t.slug} tool={t} ready={isReady(t)} />)}</div>
    </section>
  );
}
