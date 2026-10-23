import { describe, expect, it } from 'vitest';
import { executionPageWindow } from './execution-pagination.js';

describe('executionPageWindow', () => {
  it('shows at most ten records on each page', () => {
    expect(executionPageWindow(25, 1)).toEqual({ page: 1, pageCount: 3, start: 0, end: 10 });
    expect(executionPageWindow(25, 2)).toEqual({ page: 2, pageCount: 3, start: 10, end: 20 });
    expect(executionPageWindow(25, 3)).toEqual({ page: 3, pageCount: 3, start: 20, end: 25 });
  });

  it('supports 1000-row history pages without changing execution pages', () => {
    expect(executionPageWindow(2005, 2, 1000)).toEqual({ page: 2, pageCount: 3, start: 1000, end: 2000 });
    expect(executionPageWindow(2005, 3, 1000)).toEqual({ page: 3, pageCount: 3, start: 2000, end: 2005 });
  });

  it('clamps the page after records are removed', () => {
    expect(executionPageWindow(10, 3)).toEqual({ page: 1, pageCount: 1, start: 0, end: 10 });
    expect(executionPageWindow(0, 2)).toEqual({ page: 1, pageCount: 1, start: 0, end: 0 });
  });
});
