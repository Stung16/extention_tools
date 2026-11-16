import { Suspense, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { Faq, HowTo, Related } from "../components/ToolSections";
import ServerTool from "../tools/ServerTool";
import { CLIENT_TOOLS } from "../tools/index";
import { ALL_TOOLS, SITE_NAME } from "../catalog";
import NotFound from "./NotFound";

// Trang của một công cụ: /nen-pdf, /sua-pdf...
export default function ToolPage({ jobTypes, isReady }) {
  const { slug } = useParams();
  const tool = ALL_TOOLS.find((t) => t.slug === slug);

  useEffect(() => {
    if (tool) document.title = `${tool.name} miễn phí | ${SITE_NAME}`;
  }, [tool]);

  if (!tool) return <NotFound />;

  const type = tool.job ? jobTypes[tool.job] : null;
  const ClientTool = tool.client ? CLIENT_TOOLS[tool.client] : null;

  // Gợi ý làm tiếp sau khi xong: kết quả là PDF thì gợi ý nén; thêm vài công cụ cùng nhóm.
  const compress = ALL_TOOLS.find((t) => t.job === "compress-pdf");
  const suggestions = [
    ...(tool.category.id === "sang-pdf" && isReady(compress) ? [compress] : []),
    ...ALL_TOOLS.filter((t) => t.category === tool.category && t.slug !== tool.slug && isReady(t)),
  ].slice(0, 3);

  let body;
  if (ClientTool) body = <ClientTool tool={tool} jobTypes={jobTypes} />;
  else if (type) body = <ServerTool key={tool.slug} tool={tool} type={type} suggestions={suggestions} />;
  else
    body = (
      <div className="panel">
        <div className="soon-box">
          <h2>Công cụ này sắp ra mắt</h2>
          <p>Trong lúc chờ, bạn có thể dùng các công cụ khác bên dưới.</p>
          <Link className="btn secondary" to="/">Xem tất cả công cụ</Link>
        </div>
      </div>
    );

  return (
    <div className="wrap">
      <nav className="crumbs" aria-label="Đường dẫn">
        <Link to="/">Trang chủ</Link> › <a href={"/#" + tool.category.id}>{tool.category.name}</a> › <span>{tool.name}</span>
      </nav>
      <section className="tool-hero">
        <h1>{tool.name}</h1>
        <p>{tool.desc}</p>
      </section>
      <Suspense fallback={<div className="panel"><div className="spinner" /></div>}>{body}</Suspense>
      <HowTo tool={tool} type={type} />
      <Faq tool={tool} type={type} />
      <Related tool={tool} isReady={isReady} />
    </div>
  );
}
