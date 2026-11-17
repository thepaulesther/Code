import AxeBuilder from '@axe-core/playwright';
import { upgradeV2toV3 } from '../src/lib/books';
import { expect, isPhone, sampleData, stored, storedRaw, test } from './fixtures';

/** The Dashboard: balance, money boxes, payments to sort, and moving money between Personal and Business. */

/** Sample data saved in the current format with business mode on and two payments waiting to be sorted. */
function withUnsorted() {
  const s = upgradeV2toV3(sampleData()) as Record<string, unknown> & { settings: Record<string, unknown> };
  const today = new Date().toISOString().slice(0, 10);
  s.settings = { ...s.settings, business: true };
  s.unsorted = [
    { id: 'u1', type: 'income', amount: 4_500_000, category: 'Other income', note: 'Transfer from Chidi', date: today },
    { id: 'u2', type: 'expense', amount: 2_000_000, category: 'Transport', note: 'Filling station', date: today },
  ];
  return s;
}

test('the dashboard shows the balance, money boxes and their details', async ({ page, seed, pageErrors }) => {
  await seed(sampleData());
  await page.goto('/');
  const balance = page.locator('[data-testid="dash-balance"]');
  await expect(balance).toContainText('£');

  // Four budgets are money boxes; open one.
  const groceries = page.locator('.dash-tile', { hasText: 'Groceries' });
  await expect(page.locator('.dash-grid .dash-tile')).toHaveCount(5); // 4 boxes + "New box"
  await groceries.click();
  await expect(groceries).toHaveAttribute('aria-expanded', 'true');
  const detail = page.locator('.dash-detail');
  await expect(detail).toContainText('Left to spend');
  await expect(detail).toContainText('Repeats');

  // "Add expense" from the box starts on its category.
  await detail.locator('button:has-text("Add expense")').click();
  await expect(page.locator('dialog[open] #tx-category')).toHaveValue('Groceries');
  await page.keyboard.press('Escape');

  // Hiding amounts hides every figure on the card, and is remembered.
  await page.click('.dash-eye');
  await expect(balance).toHaveText('••••••');
  await page.reload();
  await expect(balance).toHaveText('••••••');
  await page.click('.dash-eye');
  await expect(balance).toContainText('£');
  expect(pageErrors).toEqual([]);
});

test('payments to sort go to Personal or Business, or are split between them', async ({ page, seed, pageErrors }) => {
  await seed(withUnsorted());
  await page.goto('/');
  const strip = page.locator('.dash-unsorted');
  await expect(strip).toContainText('2 payments to sort');

  await strip.locator('button[aria-label="Transfer from Chidi: Business"]').click();
  await expect(strip).toContainText('1 payment to sort');
  expect((await stored(page, 'business')).transactions.map((t: { note: string }) => t.note)).toContain('Transfer from Chidi');

  await strip.locator('button[aria-label="Filling station: split between both"]').click();
  await page.locator('.dash-split input[type="range"]').fill('60');
  await expect(page.locator('.dash-split-parts')).toContainText('£12,000.00');
  await page.click('.dash-split button:has-text("Save split")');
  await expect(strip).toHaveCount(0);
  const biz = (await stored(page, 'business')).transactions.find((t: { note: string }) => t.note === 'Filling station');
  const per = (await stored(page)).transactions.find((t: { note: string }) => t.note === 'Filling station');
  expect([biz.amount, per.amount]).toEqual([12_000, 8_000]);
  expect(biz.splitId).toBe(per.splitId);

  // Undo puts the payment back to be sorted.
  await page.click('.toast .toast-action');
  await expect(strip).toContainText('1 payment to sort');
  expect(pageErrors).toEqual([]);
});

test('pay yourself moves money from Business to Personal without counting as spending', async ({ page, seed, pageErrors }) => {
  await seed(withUnsorted());
  await page.goto('/');
  await page.click('.book-switch [role="radio"]:has-text("Business")');
  await expect(page.locator('.book-tag')).toHaveText('Business');
  await expect(page.locator('#dash-balance-label')).toHaveText('Business balance');

  await page.click('.dash-add-money:has-text("Pay yourself")');
  await page.fill('#pay-amount', '500');
  await page.click('dialog[open] button[type="submit"]');
  const raw = await storedRaw(page);
  expect(raw.transfers).toHaveLength(1);
  expect(raw.transfers[0]).toMatchObject({ from: 'business', to: 'personal', amount: 50_000 });
  // Neither book gained a transaction.
  expect((await stored(page, 'business')).transactions).toHaveLength(0);
  expect((await stored(page)).transactions.length).toBe(sampleData().transactions.length);
  await expect(page.locator('[data-testid="dash-balance"]')).toContainText('500.00');
  expect(pageErrors).toEqual([]);
});

test('the + menu on phones offers the add options', async ({ page, seed }) => {
  test.skip(!isPhone(page), 'The floating + button is for phones.');
  await seed(withUnsorted());
  await page.goto('/');
  await page.click('.fab');
  const list = page.locator('.add-menu-list');
  await expect(list).toContainText('Add expense');
  await expect(list).toContainText('Add income');
  await expect(list).toContainText('Move money between sides');
  await page.keyboard.press('Escape');
  await expect(list).toHaveCount(0);
  await page.click('.fab');
  await list.locator('button:has-text("Add expense")').click();
  await expect(page.locator('dialog[open] .adding-to')).toContainText('Personal');
});

for (const scheme of ['light', 'dark'] as const) {
  test(`the dashboard meets WCAG 2.2 AA (${scheme})`, async ({ page, seed }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const data = withUnsorted();
    data.settings.theme = 'system';
    await seed(data);
    await page.goto('/');
    await page.locator('.dash-tile', { hasText: 'Groceries' }).click();
    await page.locator('button[aria-label="Filling station: split between both"]').click();
    await page.locator('.dash-summary', { hasText: 'Savings' }).click();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
}
