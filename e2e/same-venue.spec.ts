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

test('selects the same venue for paired positions and blocks single-mode launch', async ({ page }) => {
  let mode: 'SINGLE' | 'DUAL' = 'DUAL';
  await page.route('**/api/trading/position-mode/*', (route) => route.fulfill({ json: {
    symbol: decodeURIComponent(route.request().url().split('/').at(-1) ?? ''), positionMode: mode,
    accountMode: 'CROSS_EXCHANGE', exchangeType: 'CROSSEX',
  } }));
  await page.goto('/strategies/paired-position');
  await page.getByRole('button', { name: 'Exchange B: OKX' }).click();
  await page.getByRole('menu', { name: 'Exchange B' }).getByRole('menuitemradio', { name: /Binance/ }).click();
  await expect(page.getByRole('button', { name: 'Exchange A: Binance' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Exchange B: Binance' })).toBeVisible();
  await expect(page.locator('.same-venue-hedge-note')).toContainText('dual positions');
  const makerTaker = page.getByRole('button', { name: /^◫ Maker–Taker/ });
  await expect(makerTaker).toBeEnabled();
  await makerTaker.click();
  await expect(makerTaker).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('group', { name: 'Choose maker leg' })).toBeVisible();
  await page.getByLabel('Per-order quantity').fill('0.001');
  await page.getByLabel('Total amount').fill('0.001');
  await page.getByLabel('Entry threshold').fill('-10');
  mode = 'SINGLE';
  await page.getByRole('button', { name: 'Exchange B: Binance' }).click();
  await page.getByRole('menu', { name: 'Exchange B' }).getByRole('menuitemradio', { name: /OKX/ }).click();
  await page.getByRole('button', { name: 'Exchange B: OKX' }).click();
  await page.getByRole('menu', { name: 'Exchange B' }).getByRole('menuitemradio', { name: /Binance/ }).click();
  await expect(page.locator('.same-venue-hedge-note')).toContainText('requires verified dual position mode');
  await expect(page.locator('.start-strategy')).toBeDisabled();
});


test('contract options stay above exchange controls and can be clicked', async ({ page }) => {
  for (const width of [600, 1440, 946]) {
    await page.setViewportSize({ width, height: 960 });
    await page.goto('/strategies/paired-position');
    const contract = page.getByRole('combobox', { name: 'Search asset' });
    await contract.fill('ETH');
    const option = page.getByRole('option', { name: /ETH/ }).first();
    await expect(option).toBeVisible();
    // Playwright's click checks the hit target, so an overlapping exchange control fails here.
    await option.click({ timeout: 3000 });
    await expect(contract).toHaveAttribute('placeholder', 'ETHUSDT PERP');
  }
  await page.getByRole('combobox', { name: 'Search asset' }).fill('BTC');
  await expect(page.getByRole('option', { name: /BTC/ }).first()).toBeVisible();
  await expect(page.locator('.strategy-asset-search-menu')).toHaveCSS('opacity', '1');
  await page.locator('.strategy-market-panel').screenshot({ path: '.local-data/deploy/contract-dropdown-fixed.png', animations: 'disabled' });
});
