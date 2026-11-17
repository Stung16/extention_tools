import { Link, Outlet } from "react-router-dom";
import { CATEGORIES, SITE_NAME } from "@/catalog/categories";

// Khung chung của mọi trang: thanh trên cùng, nội dung, chân trang.
export default function Layout() {
  const words = SITE_NAME.split(" ");
  const last = words.pop(); // từ cuối của tên trang tô màu khác
  return (
    <>
      <header className="topbar">
        <div className="wrap">
          <Link className="logo" to="/">
            {words.join(" ")} <span>{last}</span>
          </Link>
          <nav className="nav" aria-label="Nhóm công cụ">
            {CATEGORIES.map((c) => (
              <a key={c.id} href={"/#" + c.id}>
                {c.name}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
      <footer>
        <div className="wrap">
          © {new Date().getFullYear()} {SITE_NAME}. Công cụ xử lý file cho người Việt.
        </div>
      </footer>
    </>
  );
}
