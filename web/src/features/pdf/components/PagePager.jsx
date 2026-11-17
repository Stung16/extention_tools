// Nút chuyển trang ‹ Trang 2/5 ›. PDF chỉ có một trang thì không hiện.
export default function PagePager({ page, pageCount, onPage }) {
  if (pageCount <= 1) return null;
  return (
    <div className="pager">
      <button
        type="button"
        className="icon-btn"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        aria-label="Trang trước"
      >
        ‹
      </button>
      <span>
        Trang {page}/{pageCount}
      </span>
      <button
        type="button"
        className="icon-btn"
        disabled={page >= pageCount}
        onClick={() => onPage(page + 1)}
        aria-label="Trang sau"
      >
        ›
      </button>
    </div>
  );
}
