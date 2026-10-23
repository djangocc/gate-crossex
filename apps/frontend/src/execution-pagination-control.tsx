import { useLanguage } from './i18n.js';
import { EXECUTION_PAGE_SIZE, executionPageWindow } from './execution-pagination.js';

export function ExecutionPagination({ itemCount, page, onPageChange, pageSize = EXECUTION_PAGE_SIZE, hasMore = false, loading = false }: {
  itemCount: number; page: number; onPageChange: (page: number) => void;
  pageSize?: number; hasMore?: boolean; loading?: boolean;
}) {
  const { t } = useLanguage();
  if (itemCount < pageSize && !hasMore && pageSize === EXECUTION_PAGE_SIZE) return null;
  const window = executionPageWindow(itemCount, page, pageSize);
  return <div className="funding-pagination execution-pagination">
    <span className="page-range">{itemCount ? window.start + 1 : 0}–{window.end} / {itemCount}{hasMore ? '+' : ''}</span>
    <div className="page-controls">
      <button type="button" onClick={() => onPageChange(window.page - 1)} disabled={loading || window.page <= 1}>{t('Prev')}</button>
      {pageSize === EXECUTION_PAGE_SIZE ? <span className="page-indicator">{t('Page')} {window.page} / {window.pageCount}</span>
        : <label className="page-indicator">{t('Page')} <select aria-label={t('Jump to page')} value={window.page} disabled={loading} onChange={(event) => onPageChange(Number(event.target.value))}>
          {Array.from({ length: window.pageCount }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
        </select> / {window.pageCount}{hasMore ? '+' : ''}</label>}
      <button type="button" onClick={() => onPageChange(window.page + 1)} disabled={loading || (window.page >= window.pageCount && !hasMore)}>{t(loading ? 'Loading…' : 'Next')}</button>
    </div>
    <span className="page-size">{pageSize.toLocaleString()} {t('per page')}</span>
  </div>;
}
