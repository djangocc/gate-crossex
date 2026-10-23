import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.request.post('/__e2e/manual-positions');
  await page.route('**/api/onboarding/connection', (route) => route.fulfill({ json: {
    configured: true, storage: 'memory_test_only', label: 'E2E account', lastVerifiedAt: new Date().toISOString(),
    secureEntryPath: '/secure/credentials', readOnly: false, activeProfileId: 'e2e-manual', profiles: [],
  } }));
});

test.afterEach(async ({ page }) => {
  await page.request.delete('/__e2e/manual-positions');
});

test('reviews manual dual opens and closes and uses the matching close quantity', async ({ page }) => {
  const requests: Array<Record<string, unknown>> = [];
  await page.route('**/api/trading/position-mode/*', (route) => route.fulfill({ json: {
    symbol: 'GATE_FUTURE_BTC_USDT', positionMode: 'DUAL', accountMode: 'CROSS_EXCHANGE', exchangeType: 'CROSSEX',
  } }));
  // All order submissions are intercepted in the browser; no order reaches even the E2E gateway.
  await page.route('**/api/trading/orders', async (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    await route.fulfill({ json: {
      id: `e2e-order-${requests.length}`, remoteOrderId: null, clientOrderId: 'e2e-client', venue: 'GATE',
      ...body, price: body.price ?? null, state: 'NEW', executedQuantity: '0', executedAveragePrice: null,
      strategyId: null, strategyLeg: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    } });
  });
  await page.goto('/');
  const panel = page.locator('.order-panel');
  await expect(panel.getByRole('button', { name: 'Refresh position mode' })).toHaveText('Dual position mode');
  await panel.locator('label.trade-input').filter({ hasText: /^Price/ }).locator('input').fill('64000');
  const amount = panel.locator('label.trade-input').filter({ hasText: /^Amount/ }).locator('input');
  for (const [reduceOnly, action] of [[false, 'Open long'], [false, 'Open short'], [true, 'Close short'], [true, 'Close long']] as const) {
    await panel.getByRole('checkbox', { name: 'Reduce only' }).setChecked(reduceOnly);
    await panel.locator('.trade-side-tabs').getByRole('button', { name: action, exact: true }).click();
    await amount.fill('0.001');
    await panel.locator('.submit-order').click();
    const confirmation = page.getByRole('dialog', { name: 'Confirm order' });
    await expect(confirmation).toContainText(action);
    await expect(confirmation).toContainText('Dual position mode');
    await expect(confirmation.locator('dt').filter({ hasText: /^Position side$/ })).toBeVisible();
    await confirmation.locator('.confirm-submit').click();
    await expect(confirmation).toBeHidden();
    await expect(panel.locator('.submit-order')).toBeEnabled();
  }
  expect(requests.map((body) => [body.side, body.reduceOnly, body.expectedPositionMode])).toEqual([
    ['BUY', false, 'DUAL'], ['SELL', false, 'DUAL'], ['BUY', true, 'DUAL'], ['SELL', true, 'DUAL'],
  ]);
  await amount.fill('0.02');
  await expect(panel.locator('.submit-order')).toBeDisabled();
  await expect(panel).toContainText('Close quantity exceeds the matching position');
  await panel.locator('.trade-side-tabs').getByRole('button', { name: 'Close short', exact: true }).click();
  await expect(panel.locator('.submit-order')).toBeEnabled();
});

test('blocks an unknown mode and refreshes a changed mode without resubmitting', async ({ page }) => {
  let mode: 'SINGLE' | 'DUAL' | null = null;
  let submissions = 0;
  await page.route('**/api/trading/position-mode/*', (route) => mode
    ? route.fulfill({ json: { symbol: 'GATE_FUTURE_BTC_USDT', positionMode: mode, accountMode: 'CROSS_EXCHANGE', exchangeType: 'CROSSEX' } })
    : route.fulfill({ status: 503, json: { error: 'order_position_mode_unavailable' } }));
  await page.route('**/api/trading/orders', async (route) => {
    submissions += 1;
    mode = 'SINGLE';
    await route.fulfill({ status: 409, json: { error: 'order_position_mode_changed' } });
  });
  await page.goto('/');
  const panel = page.locator('.order-panel');
  const refresh = panel.getByRole('button', { name: 'Refresh position mode' });
  await expect(refresh).toHaveText('Unable to verify position mode');
  await panel.locator('label.trade-input').filter({ hasText: /^Price/ }).locator('input').fill('64000');
  await panel.locator('label.trade-input').filter({ hasText: /^Amount/ }).locator('input').fill('0.001');
  await expect(panel.locator('.submit-order')).toBeDisabled();
  expect(submissions).toBe(0);
  mode = 'DUAL';
  await refresh.click();
  await expect(refresh).toHaveText('Dual position mode');
  await panel.locator('.submit-order').click();
  await page.getByRole('dialog', { name: 'Confirm order' }).locator('.confirm-submit').click();
  await expect(page.getByText('Position mode changed. Review the order again.', { exact: true })).toBeVisible();
  await expect(refresh).toHaveText('Single position mode');
  await expect(panel.locator('.trade-side-tabs').getByRole('button', { name: 'Buy / Long', exact: true })).toBeVisible();
  expect(submissions).toBe(1);
});

test('selects Aster and reviews a dual order with its own symbol and position mode', async ({ page }) => {
  const symbol = 'ASTER_FUTURE_BTC_USDT';
  const requests: Array<Record<string, unknown>> = [];
  await page.route('**/api/trading/position-mode/*', (route) => route.fulfill({ json: {
    symbol: decodeURIComponent(route.request().url().split('/').at(-1) ?? ''),
    positionMode: 'DUAL', accountMode: 'CROSS_EXCHANGE', exchangeType: 'CROSSEX',
  } }));
  await page.route('**/api/trading/orders', async (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    await route.fulfill({ json: {
      id: 'aster-simulated-order', remoteOrderId: null, clientOrderId: 'e2e-aster', ...body,
      price: body.price ?? null, state: 'NEW', executedQuantity: '0', executedAveragePrice: null,
      strategyId: null, strategyLeg: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Execution venue: Gate.io' }).click();
  await page.getByRole('menu', { name: 'Execution venue' }).getByRole('menuitemradio', { name: /Aster/ }).click();
  await expect(page.getByRole('button', { name: 'Execution venue: Aster' })).toBeVisible();
  const panel = page.locator('.order-panel');
  await expect(panel.getByRole('button', { name: 'Refresh position mode' })).toHaveText('Dual position mode');
  await panel.locator('label.trade-input').filter({ hasText: /^Price/ }).locator('input').fill('64000');
  await panel.locator('label.trade-input').filter({ hasText: /^Amount/ }).locator('input').fill('0.001');
  await panel.locator('.submit-order').click();
  const confirmation = page.getByRole('dialog', { name: 'Confirm order' });
  await expect(confirmation).toContainText('BTCUSDT perpetual · Aster');
  await expect(confirmation).toContainText('Open long');
  await confirmation.locator('.confirm-submit').click();
  await expect(confirmation).toBeHidden();
  expect(requests).toEqual([expect.objectContaining({ symbol, side: 'BUY', expectedPositionMode: 'DUAL', reduceOnly: false })]);
});
