import { useEffect } from "react";

// Đặt tiêu đề tab trình duyệt cho trang đang xem.
export default function useDocumentTitle(title) {
  useEffect(() => {
    if (title) document.title = title;
  }, [title]);
}
