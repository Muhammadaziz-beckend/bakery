import "../../static/css/components/pages/pagination.css";

// Простой пейджер для DRF PageNumberPagination ({count, next, previous, results}).
// page — текущая страница (с 1), totalPages считается на основе count и pageSize.
export function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;

  return (
    <div className="header_pagination">
      <button
        type="button"
        className="page_btn"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        aria-label="Предыдущая страница"
      >
        ‹
      </button>

      <span className="page_indicator">
        {page} из {totalPages}
      </span>

      <button
        type="button"
        className="page_btn"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        aria-label="Следующая страница"
      >
        ›
      </button>
    </div>
  );
}
