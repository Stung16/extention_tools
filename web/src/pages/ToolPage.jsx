import { Suspense } from "react";
import { Link, useParams } from "react-router-dom";
import { SITE_NAME } from "@/catalog/categories";
import { useJobTypes } from "@/catalog/JobTypesContext";
import { findTool, nextSuggestions, relatedTools } from "@/catalog/queries";
import { CLIENT_TOOLS } from "@/features/clientTools";
import ServerTool from "@/features/server-jobs/ServerTool";
import useDocumentTitle from "@/shared/hooks/useDocumentTitle";
import NotFoundPage from "./NotFoundPage";
import { Faq, HowTo, Related } from "./tool-page/ToolSections";

// Trang của một công cụ: /nen-pdf, /sua-pdf...
// Phần thao tác: công cụ chạy trên trình duyệt (CLIENT_TOOLS), hoặc ServerTool nếu API hỗ trợ job, hoặc "Sắp ra mắt".
export default function ToolPage() {
  const { slug } = useParams();
  const { jobTypes, isReady } = useJobTypes();
  const tool = findTool(slug);
  useDocumentTitle(tool && `${tool.name} miễn phí | ${SITE_NAME}`);

  if (!tool) return <NotFoundPage />;

  const type = tool.job ? jobTypes[tool.job] : null;
  const ClientTool = tool.client ? CLIENT_TOOLS[tool.client] : null;

  let body;
  if (ClientTool) body = <ClientTool key={tool.slug} />;
  else if (type)
    body = <ServerTool key={tool.slug} tool={tool} type={type} suggestions={nextSuggestions(tool, isReady)} />;
  else body = <ComingSoon />;

  return (
    <div className="wrap">
      <nav className="crumbs" aria-label="Đường dẫn">
        <Link to="/">Trang chủ</Link> › <a href={"/#" + tool.category.id}>{tool.category.name}</a> ›{" "}
        <span>{tool.name}</span>
      </nav>
      <section className="tool-hero">
        <h1>{tool.name}</h1>
        <p>{tool.desc}</p>
      </section>
      <Suspense
        fallback={
          <div className="panel">
            <div className="spinner" />
          </div>
        }
      >
        {body}
      </Suspense>
      <HowTo tool={tool} type={type} />
      <Faq tool={tool} type={type} />
      <Related tool={tool} tools={relatedTools(tool, isReady)} isReady={isReady} />
    </div>
  );
}

function ComingSoon() {
  return (
    <div className="panel">
      <div className="soon-box">
        <h2>Công cụ này sắp ra mắt</h2>
        <p>Trong lúc chờ, bạn có thể dùng các công cụ khác bên dưới.</p>
        <Link className="btn secondary" to="/">
          Xem tất cả công cụ
        </Link>
      </div>
    </div>
  );
}
