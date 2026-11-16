import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import ToolCard from "../components/ToolCard";
import { plain } from "../lib/utils";
import { ALL_TOOLS, CATEGORIES, SITE_NAME } from "../catalog";

// Trang chủ: ô tìm kiếm và lưới công cụ chia theo nhóm.
export default function Home({ isReady }) {
  const [query, setQuery] = useState("");
  const location = useLocation();

  useEffect(() => {
    document.title = `${SITE_NAME}: chuyển đổi, nén, chỉnh sửa PDF, ảnh, video`;
  }, []);

  // Mở "/#sang-pdf" thì cuộn tới nhóm đó.
  useEffect(() => {
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  }, [location.hash]);

  const q = plain(query.trim());
  const sections = useMemo(
    () =>
      CATEGORIES.map((cat) => ({
        cat,
        tools: cat.tools
          .map((t) => ({ ...t, category: cat }))
          .filter((t) => !q || plain(t.name + " " + t.desc).includes(q))
          .sort((a, b) => Number(isReady(b)) - Number(isReady(a))),
      })).filter((s) => s.tools.length),
    [q, isReady],
  );
  const readyCount = ALL_TOOLS.filter(isReady).length;

  return (
    <div className="wrap">
      <section className="hero">
        <h1>Mọi công cụ xử lý file bạn cần</h1>
        <p>
          PDF, Word, Excel, ảnh, video, âm thanh: chuyển đổi, nén, chỉnh sửa, không cần cài phần mềm.
          Hiện có {readyCount} công cụ dùng được.
        </p>
        <input className="search" type="search" value={query} onChange={(e) => setQuery(e.target.value)}
               placeholder="Tìm công cụ, ví dụ: nén pdf, ký, video, chép lời..." aria-label="Tìm công cụ" />
      </section>

      {sections.length === 0 && <p className="empty">Không tìm thấy công cụ phù hợp.</p>}
      {sections.map(({ cat, tools }) => (
        <section className="category" id={cat.id} key={cat.id}>
          <h2>{cat.name}</h2>
          <div className="grid">{tools.map((t) => <ToolCard key={t.slug} tool={t} ready={isReady(t)} />)}</div>
        </section>
      ))}
    </div>
  );
}
