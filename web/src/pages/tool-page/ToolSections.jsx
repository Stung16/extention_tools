import { ToolGrid } from "@/shared/components/ToolCard";
import { faqItems, howToSteps } from "./toolHelp";

// Các phần bên dưới trang công cụ: cách dùng, câu hỏi thường gặp, công cụ cùng nhóm.

export function HowTo({ tool, type }) {
  return (
    <section className="section">
      <h2>Cách dùng công cụ {tool.name}</h2>
      <div className="steps">
        {howToSteps(tool, type).map((s) => (
          <div className="step" key={s}>
            <p>{s}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Faq({ tool, type }) {
  return (
    <section className="section">
      <h2>Câu hỏi thường gặp</h2>
      <div className="faq">
        {faqItems(tool, type).map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function Related({ tool, tools, isReady }) {
  return (
    <section className="section">
      <h2>Công cụ khác trong nhóm &quot;{tool.category.name}&quot;</h2>
      <ToolGrid tools={tools} isReady={isReady} />
    </section>
  );
}
