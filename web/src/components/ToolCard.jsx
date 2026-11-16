import { Link } from "react-router-dom";

// Thẻ một công cụ trong lưới (trang chủ, công cụ liên quan).
export default function ToolCard({ tool, ready }) {
  return (
    <Link className={"tool-card" + (ready ? "" : " soon")} to={"/" + tool.slug}>
      <div className="icon">{tool.icon}</div>
      <div>
        <strong>
          {tool.name}
          {!ready && <span className="badge">Sắp có</span>}
          {ready && tool.client && <span className="badge local">Trên máy bạn</span>}
        </strong>
        <small>{tool.desc}</small>
      </div>
    </Link>
  );
}
