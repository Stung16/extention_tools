import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { SITE_NAME } from "@/catalog/categories";
import { useJobTypes } from "@/catalog/JobTypesContext";
import { ALL_TOOLS, searchCatalog } from "@/catalog/queries";
import { ToolGrid } from "@/shared/components/ToolCard";
import useDocumentTitle from "@/shared/hooks/useDocumentTitle";

// Trang chủ: ô tìm kiếm và lưới công cụ chia theo nhóm.
export default function HomePage() {
  const [query, setQuery] = useState("");
  const { isReady } = useJobTypes();
  const location = useLocation();
  useDocumentTitle(`${SITE_NAME}: chuyển đổi, nén, chỉnh sửa PDF, ảnh, video`);

  // Mở "/#sang-pdf" thì cuộn tới nhóm đó.
  useEffect(() => {
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  }, [location.hash]);

  const sections = useMemo(() => searchCatalog(query, isReady), [query, isReady]);
  const readyCount = ALL_TOOLS.filter(isReady).length;

  return (
    <div className="wrap">
      <section className="hero">
        <h1>Mọi công cụ xử lý file bạn cần</h1>
        <p>
          PDF, Word, Excel, ảnh, video, âm thanh: chuyển đổi, nén, chỉnh sửa, không cần cài phần mềm. Hiện có{" "}
          {readyCount} công cụ dùng được.
        </p>
        <input
          className="search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm công cụ, ví dụ: nén pdf, ký, video, chép lời..."
          aria-label="Tìm công cụ"
        />
      </section>

      {sections.length === 0 && <p className="empty">Không tìm thấy công cụ phù hợp.</p>}
      {sections.map(({ category, tools }) => (
        <section className="category" id={category.id} key={category.id}>
          <h2>{category.name}</h2>
          <ToolGrid tools={tools} isReady={isReady} />
        </section>
      ))}
    </div>
  );
}
