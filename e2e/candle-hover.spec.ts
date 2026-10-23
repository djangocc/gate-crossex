import { expect, test } from '@playwright/test';
import type { Candle, CandleSeriesResponse } from '../apps/frontend/src/api.js';

test('hovered candle updates from the stream without moving the mouse', async ({ page }) => {
  await page.request.post('/__e2e/trading-mode', { data: { mode: 'readonly' } });
  let sendUpdate: ((symbol: string, interval: string, candle: Candle) => void) | undefined;
  await page.routeWebSocket('**/ws/stream', (socket) => {
    socket.connectToServer();
    sendUpdate = (symbol, interval, candle) => socket.send(JSON.stringify({ type: 'kline.update', payload: { symbol, interval, candle } }));
  });
  const loaded = page.waitForResponse((response) => response.url().includes('/candles?') && response.status() === 200);
  await page.goto('/');
  const series = await (await loaded).json() as CandleSeriesResponse;
  await expect(page.locator('.ohlc')).not.toContainText('—');
  const bounds = (await page.locator('.price-chart').boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width * 0.3, bounds.y + 100);
  const card = page.getByRole('tooltip', { name: 'K线详情' });
  await expect(card).toBeVisible();
  const time = Date.parse((await card.locator('time').getAttribute('datetime'))!);
  const selected = series.candles.find((candle) => candle.startTime === time)!;
  expect(selected).toBeDefined();
  expect(sendUpdate).toBeDefined();
  sendUpdate!(series.symbol, series.interval, { ...selected, close: String(Number(selected.open) * 1.1), high: String(Number(selected.open) * 1.2), closed: false });
  await expect(card.locator('dd').nth(5)).toHaveText('+10.00%');
  await expect(card).toContainText('未收盘');
  await expect(page.locator('.ohlc')).toContainText((Number(selected.open) * 1.1).toLocaleString('en-US', { maximumFractionDigits: 1 }));
});

for (const theme of ['dark', 'light'] as const) {
  test(`Chinese candle hover card in ${theme} theme`, async ({ page }) => {
    await page.request.post('/__e2e/trading-mode', { data: { mode: 'readonly' } });
    await page.route('**/api/preferences', async (route) => {
      if (route.request().method() === 'GET') await route.fulfill({ json: { preferences: { theme, language: 'en' } } });
      else await route.continue();
    });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('.ohlc')).not.toContainText('—');
    await expect(page.locator('.ohlc')).toContainText('开盘');
    const chart = page.locator('.price-chart');
    await expect(chart.locator('canvas').first()).toBeVisible();
    const bounds = (await chart.boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width * 0.3, bounds.y + 100);
    const card = page.getByRole('tooltip', { name: 'K线详情' });
    await expect(card).toBeVisible();
    await expect(card.locator('dt')).toHaveText(['开盘价', '最高价', '最低价', '收盘价', '涨跌额', '涨跌幅', '振幅', '成交量']);
    await expect(card).toContainText('均以本根开盘价为基准');
    await expect(card).toHaveClass(/right/);
    const values = await card.locator('dd').allTextContents();
    const numbers = values.map((value) => Number(value.replaceAll(',', '').replace('%', '')));
    expect(numbers[5]).toBeCloseTo((numbers[3] - numbers[0]) / numbers[0] * 100, 4);
    expect(numbers[6]).toBeCloseTo((numbers[1] - numbers[2]) / numbers[0] * 100, 4);
    const cardBounds = (await card.boundingBox())!;
    expect(cardBounds.y + cardBounds.height).toBeLessThanOrEqual(bounds.y + bounds.height);
    await chart.screenshot({ path: `../pr-preparation/candle-hover-${theme}.png` });
    await page.mouse.move(bounds.x + bounds.width * 0.7, bounds.y + 100);
    await expect(card).toHaveClass(/left/);
    await page.locator('.chart-toolbar button').filter({ hasText: /^5m$/ }).click();
    await expect(card).toHaveCount(0);
    await expect(page.locator('.ohlc')).not.toContainText('—');
    await page.mouse.move(bounds.x + bounds.width * 0.3, bounds.y + 110);
    await expect(card).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(card).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await chart.scrollIntoViewIfNeeded();
    const narrow = (await chart.boundingBox())!;
    await page.mouse.move(narrow.x + narrow.width * 0.3, narrow.y + 110);
    await expect(card).toBeVisible();
    const narrowCard = (await card.boundingBox())!;
    expect(narrowCard.x).toBeGreaterThanOrEqual(narrow.x);
    expect(narrowCard.x + narrowCard.width).toBeLessThanOrEqual(narrow.x + narrow.width);
    expect(narrowCard.y + narrowCard.height).toBeLessThanOrEqual(narrow.y + narrow.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await chart.screenshot({ path: `../pr-preparation/candle-hover-mobile-${theme}.png` });
  });
}
