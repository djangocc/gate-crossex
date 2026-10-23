import { expect, test } from '@playwright/test';

test('browses complete order history, preserves partial cancellations and queries delisted symbols', async ({ page }) => {
  await page.request.post('/__e2e/manual-positions');
  const requests: URLSearchParams[] = [];
  const cutoff = 1893456300000;
  let failNext = true;
  await page.route('**/api/crossex/history-orders?**', async (route) => {
    const query = new URL(route.request().url()).searchParams;
    requests.push(query);
    expect(route.request().headers()['x-gct-read-intent']).toBe('order-history');
    expect(query.get('limit')).toBe('1000');
    const currentPage = Number(query.get('page') ?? 1);
    if (currentPage === 2 && failNext) {
      failNext = false;
      await route.fulfill({ status: 502, json: { error: 'order_history_unavailable' } });
      return;
    }
    const filtered = query.has('symbol');
    const start = currentPage === 1 ? 0 : 999;
    const items = Array.from({ length: filtered ? 1 : currentPage === 1 ? 1000 : 2 }, (_, index) => {
      const id = start + index;
      return {
        id: `900719925474099${String(id).padStart(4, '0')}`, text: `order-${id}`,
        symbol: 'ASTER_FUTURE_PTB_USDT', venue: 'ASTER', side: 'SELL', positionSide: 'LONG',
        type: id === 0 ? 'MARKET' : 'LIMIT', attribute: id === 0 ? 'SETTLEMENT' : 'COMMON',
        state: id === 1 ? 'CANCELLED' : 'FILLED', reason: id === 0 ? 'delist' : '',
        quantity: '20000', executedQuantity: id === 1 ? '1272' : '20000', price: '0.00061',
        executedAvgPrice: '0.0006073', fee: '0.0051', feeCoin: 'USDT', reduceOnly: true,
        createdAt: new Date(cutoff - id * 1000).toISOString(), updatedAt: new Date(cutoff - id * 1000).toISOString(),
      };
    });
    await route.fulfill({ json: { items, fetchedAt: new Date(cutoff).toISOString(), pagination: {
      page: currentPage, limit: 1000, to: cutoff, hasMore: !filtered && currentPage === 1,
    } } });
  });
  try {
    await page.goto('/portfolio');
    const activity = page.locator('.activity-card');
    await activity.getByRole('button', { name: 'Order history', exact: true }).click();
    expect(await activity.locator('.activity-tabs button').allTextContents()).toEqual([
      expect.stringContaining('Transfers'), expect.stringContaining('Funding fees'), expect.stringContaining('Account ledger'), 'Order history', 'Position history',
    ]);
    const rows = activity.locator('tbody tr');
    await expect(rows).toHaveCount(1000);
    await expect(rows.first()).toContainText('Delisting settlement');
    await expect(rows.first()).toContainText('0.0006073');
    await expect(rows.first()).toContainText('9007199254740990000');
    await expect(rows.nth(1)).toContainText('1272');
    await expect(rows.nth(1)).toContainText('Partial fill');
    await activity.getByRole('button', { name: 'Next', exact: true }).first().click();
    await expect(activity.getByRole('alert')).toContainText('Your loaded history is preserved');
    await expect(rows).toHaveCount(1000);
    await activity.getByRole('button', { name: 'Try again' }).click();
    await expect(activity.getByText('Loaded entries: 1001')).toBeVisible();
    await activity.getByRole('combobox', { name: 'Jump to page' }).first().selectOption('2');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('order-1000');
    expect(requests[1].get('to')).toBe(String(cutoff));
    expect(requests[2].get('page')).toBe('2');
    await activity.getByRole('textbox', { name: 'Contract (exact symbol)' }).fill('aster_future_ptb_usdt');
    await activity.getByRole('combobox', { name: 'Order attribute', exact: true }).selectOption('SETTLEMENT');
    await activity.getByLabel('Start time', { exact: true }).fill('2030-01-01T00:00');
    await activity.getByLabel('End time', { exact: true }).fill('2030-01-01T01:00');
    await activity.getByRole('button', { name: 'Query orders' }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Delisting settlement');
    expect(requests.at(-1)?.get('symbol')).toBe('ASTER_FUTURE_PTB_USDT');
    expect(requests.at(-1)?.get('attributes')).toBe('SETTLEMENT');
    expect(requests.at(-1)?.get('from')).toBe(String(Date.parse('2030-01-01T00:00Z')));
    await activity.screenshot({ path: '.local-data/deploy/order-history-fixed.png', animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(activity.getByRole('button', { name: 'Order history', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    await page.request.delete('/__e2e/manual-positions');
  }
});
