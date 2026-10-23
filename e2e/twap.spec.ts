import { expect, test } from '@playwright/test';

test('reviews timed market execution, retries idempotently and stops through the strategy panel', async ({ page }) => {
  await page.request.post('/__e2e/manual-positions');
  await page.route('**/api/onboarding/connection', (route) => route.fulfill({ json: {
    configured: true, storage: 'memory_test_only', label: 'E2E account', lastVerifiedAt: new Date().toISOString(),
    secureEntryPath: '/secure/credentials', readOnly: false, activeProfileId: 'e2e-manual', profiles: [],
  } }));
  await page.route('**/api/trading/position-mode/*', (route) => route.fulfill({ json: {
    symbol: decodeURIComponent(route.request().url().split('/').at(-1) ?? ''), positionMode: 'DUAL', accountMode: 'CROSS_EXCHANGE', exchangeType: 'CROSSEX',
  } }));
  await page.route('**/api/trading/leverage/*', (route) => route.fulfill({ json: {
    symbol: decodeURIComponent(route.request().url().split('/').at(-1) ?? ''), leverage: '5',
  } }));
  const submissions: Array<Record<string, unknown>> = [];
  let stored: Record<string, unknown> | null = null;
  let stops = 0;
  await page.route('**/api/strategies', async (route) => {
    if (route.request().method() === 'GET') { await route.fulfill({ json: { strategies: stored ? [stored] : [] } }); return; }
    const config = route.request().postDataJSON();submissions.push(config);
    if (submissions.length === 1) { await route.fulfill({ status: 502, json: { error: 'strategy_start_failed' } }); return; }
    stored = { id: 'TWAP-E2E', kind: 'position', status: 'RUNNING', config, progress: 0, filledQuantity: '0',
      filledLeft: '0', filledRight: '0', openPosition: '0', realizedPnl: '0', accountProfileId: 'e2e-manual', accountLabel: 'E2E',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), stoppedAt: null };
    await route.fulfill({ json: stored });
  });
  await page.route('**/api/strategies/TWAP-E2E/stop', async (route) => {
    stops++;stored = { ...stored, status: 'STOPPED', stoppedAt: new Date().toISOString() };
    await route.fulfill({ json: stored });
  });
  // Browser interception above prevents any order or strategy submission from reaching a gateway.
  try {
    await page.goto('/strategies/timed-execution');
    await expect(page.getByRole('heading', { name: 'Timed market execution', exact: true })).toBeVisible();
    await page.getByLabel('Total quantity', { exact: true }).fill('0.03');
    await page.getByLabel('Execution window (minutes)').fill('1');
    await page.getByLabel('Interval (seconds)').fill('10');
    await page.request.post('/__e2e/fresh-quotes', { data: { twap: true } });
    const review = page.getByRole('button', { name: 'Review timed execution', exact: true });
    await expect(review).toBeEnabled();
    await expect(page.locator('.twap-preview')).toContainText('0.005 BTC');
    await review.click();
    const dialog = page.getByRole('dialog', { name: 'Confirm strategy launch' });
    await expect(dialog).toContainText('Reduce only');await expect(dialog).toContainText('LONG');
    await dialog.getByRole('button', { name: 'Go back' }).click();expect(submissions).toHaveLength(0);
    await review.click();await dialog.locator('.confirm-submit').click();
    await expect(dialog.getByRole('alert')).toContainText('strategy start failed');
    await dialog.locator('.confirm-submit').click();await expect(dialog).toBeHidden();
    await expect(page.locator('.running-row').filter({ hasText: 'TWAP-E2E' })).toContainText('0 / 0.03 BTC');
    const first = submissions[0].twapPlan as Record<string, unknown>;
    expect(first).toMatchObject({ symbol: 'BINANCE_FUTURE_BTC_USDT', side: 'SELL', quantity: '0.03', durationSeconds: 60, intervalSeconds: 10, positionSide: 'LONG', expectedPositionMode: 'DUAL' });
    expect((submissions[1].twapPlan as Record<string, unknown>).requestId).toBe(first.requestId);
    expect(submissions[1]).toMatchObject({ reduceOnly: true, executionMethod: 'TAKER_TAKER' });
    await page.locator('.running-row').filter({ hasText: 'TWAP-E2E' }).getByRole('button', { name: 'Stop', exact: true }).click();
    await expect.poll(() => stops).toBe(1);
    await page.getByLabel('Order intent').selectOption('ordinary');await page.getByLabel('Direction', { exact: true }).selectOption('BUY');
    await page.getByLabel('Leverage', { exact: true }).fill('5');await expect(review).toBeEnabled();
    await review.click();await expect(dialog).toContainText('Ordinary order');await expect(dialog).toContainText('LONG');
    await dialog.getByRole('button', { name: 'Go back' }).click();
    await page.getByLabel('Interval (seconds)').fill('120');await expect(review).toBeDisabled();
    await page.getByLabel('Interval (seconds)').fill('10');
    await page.locator('.twap-layout').screenshot({ path: '.local-data/deploy/twap-desktop.png', animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByLabel('Total quantity', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally { await page.request.delete('/__e2e/manual-positions'); }
});
