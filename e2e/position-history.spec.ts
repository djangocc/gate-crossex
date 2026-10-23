import { expect, test } from '@playwright/test';

test('shows position cycles, exact fee-adjusted results, safe pagination and scoped order details', async ({ page }) => {
  await page.request.post('/__e2e/manual-positions');
  const cutoff = Date.parse('2030-01-01T01:00:00Z');
  const opened = cutoff - 3600000;
  const requests: URLSearchParams[] = [];
  const orderRequests: URLSearchParams[] = [];
  let failSecond = true;
  const position = (id: number) => ({
    id: `900719925474099${String(id).padStart(4, '0')}`, symbol: 'ASTER_FUTURE_PTB_USDT', venue: 'ASTER',
    positionSide: id === 1 ? 'SHORT' : 'LONG', closedType: id === 2 ? 'PARTIAL_CLOSED' : 'COMPLETE_CLOSED',
    openAvgPrice: '0.00124691357891234567891', closedAvgPrice: '0.0011234567899',
    closedQuantity: '100000', maxQuantity: '100000', closedValue: '112.34567899',
    realizedPnl: '-12.345678901234567891', fee: id === 3 ? null : '0.45678901',
    liquidationFee: '0', fundingFee: '-0.1', netPnl: id === 3 ? null : '-12.902467911234567891', settlementCoin: 'USDT',
    createdAt: new Date(opened).toISOString(), updatedAt: new Date(cutoff - id * 1000).toISOString(),
  });
  await page.route('**/api/crossex/history-positions?**', async (route) => {
    const query = new URL(route.request().url()).searchParams;
    requests.push(query);
    expect(query.get('limit')).toBe('1000');
    expect(route.request().headers()['x-gct-read-intent']).toBe('position-history');
    const currentPage = Number(query.get('page') ?? 1);
    if (currentPage === 2 && failSecond) {
      failSecond = false;
      await route.fulfill({ status: 502, json: { error: 'position_history_unavailable' } });
      return;
    }
    const filtered = query.has('symbol');
    const items = filtered ? [position(0), position(1)] : currentPage === 1
      ? Array.from({ length: 1000 }, (_, index) => position(index))
      : [{ ...position(999), updatedAt: new Date(opened).toISOString(), netPnl: '999' }, position(1000), position(1001)];
    await route.fulfill({ json: { items, fetchedAt: new Date(cutoff).toISOString(), pagination: {
      page: currentPage, limit: 1000, to: cutoff, hasMore: !filtered && currentPage === 1,
    } } });
  });
  await page.route('**/api/crossex/history-orders?**', async (route) => {
    const query = new URL(route.request().url()).searchParams;
    orderRequests.push(query);
    const items = ['BUY', 'SELL', 'BUY'].map((side, index) => ({
      id: `detail-${index}`, text: `scoped-order-${index}`, symbol: 'ASTER_FUTURE_PTB_USDT', venue: 'ASTER', side,
      positionSide: index === 2 ? 'SHORT' : 'LONG', type: 'LIMIT', attribute: 'COMMON', state: 'FILLED', reason: '',
      quantity: '100000', executedQuantity: '100000', price: '0.0012', executedAvgPrice: '0.0012', fee: '0.4', feeCoin: 'USDT',
      reduceOnly: side === 'SELL', createdAt: new Date(opened + 1000).toISOString(), updatedAt: new Date(cutoff).toISOString(),
    }));
    await route.fulfill({ json: { items, fetchedAt: new Date(cutoff).toISOString(), pagination: {
      page: 1, limit: 1000, to: cutoff, hasMore: false,
    } } });
  });
  try {
    await page.goto('/portfolio');
    const activity = page.locator('.activity-card');
    await activity.getByRole('button', { name: 'Position history', exact: true }).click();
    const history = activity.locator('.position-history').first();
    const rows = history.locator('.history-position-table tbody tr');
    await expect(rows).toHaveCount(999);
    await expect(rows.first()).toContainText('-12.90246791');
    await expect(rows.first().getByTitle('0.00124691357891234567891', { exact: true })).toBeVisible();
    await expect(rows.first().getByTitle('0.0011234567899', { exact: true })).toBeVisible();
    await expect(rows.nth(2).locator('td').nth(2)).toHaveAttribute('title', 'Incomplete fee data');
    await history.getByRole('combobox', { name: 'Close status' }).selectOption('PARTIAL_CLOSED');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Partially closed');
    await history.getByRole('combobox', { name: 'Close status' }).selectOption('COMPLETE_CLOSED');
    await history.getByRole('button', { name: 'Next', exact: true }).first().click();
    await expect(history.getByRole('alert')).toContainText('Your loaded history is preserved');
    await expect(rows).toHaveCount(999);
    await history.getByRole('button', { name: 'Try again' }).click();
    await expect(history.getByText('Loaded entries: 1002')).toBeVisible();
    expect(requests[1].get('to')).toBe(String(cutoff));
    expect(requests[2].get('page')).toBe('2');
    await history.getByRole('button', { name: 'Next', exact: true }).first().click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first().getByRole('button')).toHaveAttribute('aria-label', 'View orders 9007199254740991001');
    await history.getByRole('combobox', { name: 'Jump to page' }).first().selectOption('1');
    const olderDuplicate = rows.filter({ has: page.getByRole('button', { name: 'View orders 9007199254740990999', exact: true }) });
    await expect(olderDuplicate).toContainText('-12.90246791');
    await rows.first().getByRole('button', { name: 'View orders', exact: false }).click();
    const detail = history.getByRole('region', { name: 'Related contract orders' });
    await expect(detail.locator('tbody tr')).toHaveCount(2);
    await expect(detail).toContainText('not an exact position-to-order attribution');
    expect(orderRequests[0].get('symbol')).toBe('ASTER_FUTURE_PTB_USDT');
    expect(orderRequests[0].get('from')).toBe(String(opened - 60000));
    expect(orderRequests[0].get('to')).toBe(String(cutoff + 1));
    await detail.getByRole('button', { name: 'Close details' }).click();
    await history.getByRole('textbox', { name: 'Contract (exact symbol)' }).fill('aster_future_ptb_usdt');
    await history.getByLabel('Start time', { exact: true }).fill('2030-01-01T00:00');
    await history.getByLabel('End time', { exact: true }).fill('2030-01-01T01:00');
    await history.getByRole('button', { name: 'Query positions' }).click();
    await expect(rows).toHaveCount(2);
    expect(requests.at(-1)?.get('symbol')).toBe('ASTER_FUTURE_PTB_USDT');
    expect(requests.at(-1)?.get('from')).toBe(String(opened));
    await activity.screenshot({ path: '.local-data/deploy/position-history-fixed.png', animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(activity.getByRole('button', { name: 'Position history', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    await page.request.delete('/__e2e/manual-positions');
  }
});
