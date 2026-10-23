export const EXECUTION_PAGE_SIZE = 10;

export type ExecutionPageWindow = {
  page: number;
  pageCount: number;
  start: number;
  end: number;
};

export function executionPageWindow(itemCount: number, requestedPage: number, pageSize = EXECUTION_PAGE_SIZE): ExecutionPageWindow {
  const safeItemCount = Math.max(0, Math.floor(itemCount));
  const pageCount = Math.max(1, Math.ceil(safeItemCount / pageSize));
  const page = Math.min(pageCount, Math.max(1, Math.floor(requestedPage) || 1));
  const start = (page - 1) * pageSize;
  return {
    page,
    pageCount,
    start,
    end: Math.min(start + pageSize, safeItemCount),
  };
}
