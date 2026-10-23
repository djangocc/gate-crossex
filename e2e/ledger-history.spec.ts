import { expect, test } from '@playwright/test';

test('loads 1000 ledger rows per batch and page, retries safely and preserves the cutoff', async ({ page }) => {
  await page.request.post('/__e2e/manual-positions');
  const requests: Array<{ page: number; to: string | null; limit: string | null }> = [];
  const cutoff = 1893456300000;
  let failSecondPage = true;
  await page.route('**/api/crossex/portfolio-activity?**', async (route) => {
    const query = new URL(route.request().url()).searchParams;
    const currentPage = Number(query.get('page') ?? 1);
    requests.push({ page: currentPage, to: query.get('to'), limit: query.get('limit') });
    if (currentPage === 2 && failSecondPage) {
      failSecondPage = false;
      await route.fulfill({ status: 502, json: { error: 'portfolio_activity_unavailable' } });
      return;
    }
    const start = currentPage === 1 ? 0 : currentPage === 2 ? 999 : 1999;
    const length = currentPage < 3 ? 1000 : 6;
    await route.fulfill({ json: {
      transfers: [], fundingFees: [],
      accountBook: Array.from({ length }, (_, index) => ({
        id: `ledger-${start + index}`, businessId: `entry-${start + index}`,
        statementType: 'TRADING_FEE', venue: 'ASTER', coin: 'USDT', symbol: 'ASTER_FUTURE_PTB_USDT',
        change: '-0.001', balance: '100', createdAt: new Date(cutoff - (start + index) * 1000).toISOString(),
      })),
      fetchedAt: new Date(cutoff).toISOString(),
      pagination: { page: currentPage, to: cutoff, hasMore: { transfers: false, fundingFees: false, accountBook: currentPage < 3 } },
    } });
  });
  try {
    await page.goto('/portfolio');
    const activity = page.locator('.activity-card');
    await activity.getByRole('button', { name: 'Account ledger (1000)', exact: true }).click();
    await expect(activity.getByText('entry-0', { exact: true })).toBeVisible();
    await expect(activity.locator('tbody tr')).toHaveCount(1000);
    await activity.getByRole('button', { name: 'Next', exact: true }).first().click();
    await expect(activity.getByRole('status')).toContainText('Your loaded history is preserved');
    await expect(activity.getByText('entry-0', { exact: true })).toBeVisible();
    await activity.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(activity.getByRole('button', { name: 'Account ledger (1999)', exact: true })).toBeVisible();
    await activity.getByRole('button', { name: 'Next', exact: true }).first().click();
    await expect(activity.getByText('entry-1000', { exact: true })).toBeVisible();
    await expect(activity.locator('tbody tr')).toHaveCount(999);
    await activity.getByRole('textbox', { name: 'Filter activity' }).fill('entry-2004');
    await activity.getByRole('button', { name: 'Load 1,000 older entries', exact: true }).click();
    await expect(activity.getByRole('button', { name: 'Account ledger (2005)', exact: true })).toBeVisible();
    await expect(activity.getByText('entry-2004', { exact: true })).toBeVisible();
    await expect(activity.getByText('All available entries loaded', { exact: true })).toBeVisible();
    expect(requests).toEqual([
      { page: 1, to: null, limit: '1000' }, { page: 2, to: String(cutoff), limit: '1000' },
      { page: 2, to: String(cutoff), limit: '1000' }, { page: 3, to: String(cutoff), limit: '1000' },
    ]);
    await activity.getByRole('textbox', { name: 'Filter activity' }).fill('');
    await activity.getByRole('combobox', { name: 'Jump to page' }).first().selectOption('3');
    await expect(activity.locator('tbody tr')).toHaveCount(5);
    await expect(activity.getByText('entry-2000', { exact: true })).toBeVisible();
    await activity.screenshot({ path: '.local-data/deploy/ledger-history-fixed.png', animations: 'disabled' });
    await activity.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(activity.getByRole('button', { name: 'Account ledger (1000)', exact: true })).toBeVisible();
    expect(requests.at(-1)).toEqual({ page: 1, to: null, limit: '1000' });
  } finally {
    await page.request.delete('/__e2e/manual-positions');
  }
});
