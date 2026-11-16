import { useEffect } from "react";
import { Link } from "react-router-dom";
import { SITE_NAME } from "../catalog";

export default function NotFound() {
  useEffect(() => {
    document.title = `Không tìm thấy trang | ${SITE_NAME}`;
  }, []);
  return (
    <div className="wrap">
      <section className="hero">
        <h1>Không tìm thấy trang</h1>
        <p>Địa chỉ này không có công cụ nào.</p>
        <Link className="btn narrow" to="/">Về trang chủ</Link>
      </section>
    </div>
  );
}
