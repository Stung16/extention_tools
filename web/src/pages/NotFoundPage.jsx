import { Link } from "react-router-dom";
import { SITE_NAME } from "@/catalog/categories";
import useDocumentTitle from "@/shared/hooks/useDocumentTitle";

export default function NotFoundPage() {
  useDocumentTitle(`Không tìm thấy trang | ${SITE_NAME}`);
  return (
    <div className="wrap">
      <section className="hero">
        <h1>Không tìm thấy trang</h1>
        <p>Địa chỉ này không có công cụ nào.</p>
        <Link className="btn narrow" to="/">
          Về trang chủ
        </Link>
      </section>
    </div>
  );
}
