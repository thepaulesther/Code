import AxeBuilder from '@axe-core/playwright';
import { upgradeV2toV3, upgradeV3toV4 } from '../src/lib/books';
import { expect, isPhone, sampleData, stored, storedRaw, test } from './fixtures';

/** The Dashboard: balance, money boxes, payments to sort, and moving money between Personal and Business. */

/** Sample data saved in the current format with business mode on and two payments waiting to be sorted. */
function withUnsorted() {
  const s = upgradeV3toV4(upgradeV2toV3(sampleData())) as Record<string, unknown> & { settings: Record<string, unknown> };
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

test('pay yourself can repeat every month, and be stopped', async ({ page, seed, pageErrors }) => {
  await seed(withUnsorted());
  await page.goto('/');
  await page.click('.book-switch [role="radio"]:has-text("Business")');
  await page.click('.dash-add-money:has-text("Pay yourself")');
  await page.fill('#pay-amount', '300');
  await page.check('#pay-repeat');
  // The day defaults to today, so the first one happens straight away.
  await expect(page.locator('dialog[open] .pay-repeat')).toContainText('The first one happens today');
  // The business has nothing this month, so "only if there's enough" would skip it; turn that off.
  await expect(page.locator('dialog[open] .pay-repeat')).toContainText('will be skipped');
  await page.uncheck('#pay-safe');
  await page.click('dialog[open] button[type="submit"]');
  await expect(page.locator('.toast')).toContainText('every month');
  await expect.poll(async () => (await storedRaw(page)).repeatingTransfers.length).toBe(1);
  const raw = await storedRaw(page);
  expect(raw.repeatingTransfers[0]).toMatchObject({ from: 'business', to: 'personal', amount: 30_000 });
  expect(raw.repeatingTransfers[0].onlyIfSafe).toBeUndefined();
  expect(raw.transfers).toHaveLength(1);
  expect(raw.transfers[0].repeatId).toBe(raw.repeatingTransfers[0].id);
  expect(raw.transfers[0].updatedAt).toBeTruthy();

  await page.click('.dash-add-money:has-text("Pay yourself")');
  const list = page.locator('dialog[open] .pay-repeating');
  await expect(list).toContainText('Pay yourself £300.00 on the');
  await list.locator('button:has-text("Stop")').click();
  await expect(page.locator('.toast')).toContainText('Stopped');
  await expect.poll(async () => (await storedRaw(page)).repeatingTransfers.length).toBe(0);
  const after = await storedRaw(page);
  expect(after.repeatingTransfers).toHaveLength(0);
  expect(after.transfers).toHaveLength(1);
  expect(after.tombstones.map((t: { id: string }) => t.id)).toContain(raw.repeatingTransfers[0].id);
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

for (const scheme of ['light', 'dark'] as const) {
  test(`pay yourself with a monthly repeat meets WCAG 2.2 AA (${scheme})`, async ({ page, seed }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const data = withUnsorted();
    data.settings.theme = 'system';
    data.repeatingTransfers = [{ id: 'rt1', from: 'business', to: 'personal', amount: 2_000_000, day: 28, startMonth: '2026-11', note: 'Pay yourself', onlyIfSafe: true }];
    await seed(data);
    await page.goto('/');
    await page.click('.book-switch [role="radio"]:has-text("Business")');
    await page.click('.dash-add-money:has-text("Pay yourself")');
    await page.fill('#pay-amount', '300');
    await page.check('#pay-repeat');
    await expect(page.locator('dialog[open] .pay-repeating')).toContainText('on the 28th');
    const results = await new AxeBuilder({ page }).include('dialog[open]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
}

test('a money box can be added, changed and removed from the dashboard', async ({ page, seed, pageErrors }) => {
  await seed(sampleData());
  await page.goto('/');
  await page.locator('.dash-tile', { hasText: 'New box' }).click();
  await page.click('dialog[open] .chips button:has-text("Transport")');
  await page.fill('#box-amount', '100');
  await page.click('dialog[open] button[type="submit"]');
  const tile = page.locator('.dash-tile', { hasText: 'Transport' });
  await expect(tile).toBeVisible();
  expect((await stored(page)).budgets.Transport).toBe(100);

  // A brand-new name becomes a category and a box.
  await page.locator('.dash-tile', { hasText: 'New box' }).click();
  await page.fill('#box-name', 'Data');
  await page.fill('#box-amount', '30');
  await page.click('dialog[open] button[type="submit"]');
  await expect(page.locator('.dash-tile', { hasText: 'Data' })).toBeVisible();
  const d = await stored(page);
  expect(d.budgets.Data).toBe(30);
  expect(d.settings.expenseCategories).toContain('Data');

  // An existing box can't be added twice.
  await page.locator('.dash-tile', { hasText: 'New box' }).click();
  await page.fill('#box-name', 'transport');
  await page.fill('#box-amount', '5');
  await page.click('dialog[open] button[type="submit"]');
  await expect(page.locator('dialog[open] .error')).toContainText('already');
  await page.keyboard.press('Escape');

  await tile.click();
  await page.click('.dash-detail button:has-text("Edit")');
  await page.fill('#box-amount', '120');
  await page.click('dialog[open] button:has-text("Save changes")');
  expect((await stored(page)).budgets.Transport).toBe(120);

  // Its details are still open after saving.
  await expect(tile).toHaveAttribute('aria-expanded', 'true');

  // A repeating bill can be added from Edit, and shows in the box.
  await page.click('.dash-detail button:has-text("Edit")');
  await page.check('#box-repeats');
  await page.fill('#box-bill', '45');
  await page.selectOption('#box-day', '28');
  await page.click('dialog[open] button:has-text("Save changes")');
  await expect(page.locator('.dash-detail')).toContainText('Yes, a monthly bill is set up');
  expect((await stored(page)).recurring.find((r: { category: string }) => r.category === 'Transport')).toMatchObject({ amount: 45, day: 28 });
  await page.click('.dash-detail button:has-text("Edit")');
  await expect(page.locator('#box-repeats')).toBeChecked();
  await expect(page.locator('#box-day')).toHaveValue('28');
  await page.uncheck('#box-repeats');
  await page.click('dialog[open] button:has-text("Save changes")');
  await expect(page.locator('.dash-detail')).toContainText('no repeating bill');
  await page.click('.dash-detail button:has-text("Edit")');
  await page.click('dialog[open] button:has-text("Remove box")');
  await page.click('dialog[open] .confirm-row button:has-text("Remove box")');
  await expect(tile).toHaveCount(0);
  expect((await stored(page)).budgets.Transport).toBeUndefined();
  expect(pageErrors).toEqual([]);
});

test('the Business side has its own setup steps', async ({ page, seed }) => {
  await seed(withUnsorted());
  await page.goto('/');
  await page.click('.book-switch [role="radio"]:has-text("Business")');
  const guide = page.locator('.setup');
  await expect(guide.locator('#setup-title')).toContainText('Set up your business');
  await expect(guide).toContainText('Record a sale');
  await expect(guide).not.toContainText('Add your income');
  await guide.locator('button:has-text("Record sale")').click();
  await expect(page.locator('dialog[open] #sale-amount')).toBeVisible();
});

test('a sale is recorded in one step, remembering how it was paid', async ({ page, seed, pageErrors }) => {
  await seed(withUnsorted());
  await page.goto('/');
  await page.click('.book-switch [role="radio"]:has-text("Business")');
  await page.click('.dash-add-money:has-text("Record sale")');
  await page.fill('#sale-amount', '4500');
  await page.click('dialog[open] [role="radio"]:has-text("POS")');
  await page.fill('#sale-note', '3 bags of rice');
  await page.click('dialog[open] button[type="submit"]');
  const sale = (await stored(page, 'business')).transactions.find((t: { note: string }) => t.note === '3 bags of rice');
  expect(sale).toMatchObject({ type: 'income', amount: 4500, category: 'Sales', method: 'pos', date: new Date().toISOString().slice(0, 10) });
  await expect(page.locator('[data-testid="sales-today"]')).toContainText('POS');

  // The next sale starts on POS.
  await page.click('.dash-add-money:has-text("Record sale")');
  await expect(page.locator('dialog[open] [role="radio"][aria-checked="true"]')).toHaveText('POS');
  expect(pageErrors).toEqual([]);
});

test('pasted bank alerts are read, checked and added; duplicates start unticked', async ({ page, seed, pageErrors }) => {
  await seed(withUnsorted());
  await page.goto('/');
  await page.click('.book-switch [role="radio"]:has-text("Business")');
  await page.click('.dash-add-money:has-text("Record sale")');
  await page.click('dialog[open] [role="tab"]:has-text("Paste bank alert")');
  const today = new Date();
  const d = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`;
  await page.fill('#alert-text', `Credit Alert! Amt: NGN45,000.00 Desc: TRF FROM CHIDI OKAFOR Date: ${d} Bal: NGN312,400.00

Your OTP is 1234

Debit Alert Amt: NGN12,500.00 Desc: POS PURCHASE DIESEL Date: ${d}`);
  const results = page.locator('.alert-results li');
  await expect(results).toHaveCount(2);
  await expect(results.first()).toContainText('Chidi Okafor');
  await expect(page.locator('dialog[open]')).toContainText('left out');
  await page.click('dialog[open] button:has-text("Add 2 to Business")');
  const biz = (await stored(page, 'business')).transactions;
  expect(biz.find((t: { note: string }) => t.note === 'Chidi Okafor')).toMatchObject({ type: 'income', amount: 45_000, category: 'Sales', method: 'transfer' });
  expect(biz.find((t: { amount: number }) => t.amount === 12_500)).toMatchObject({ type: 'expense', category: 'Other', method: 'pos' });

  // Pasting the same alert again: it looks already recorded, so it starts unticked.
  await page.click('.fab, .dash-add-money:has-text("Record sale")');
  if (await page.locator('.add-menu-list').isVisible()) await page.click('.add-menu-list button:has-text("Paste bank alert")');
  else await page.click('dialog[open] [role="tab"]:has-text("Paste bank alert")');
  await page.fill('#alert-text', `Credit Alert! Amt: NGN45,000.00 Desc: TRF FROM CHIDI OKAFOR Date: ${d}`);
  await expect(page.locator('.alert-results li')).toContainText('looks already recorded');
  await expect(page.locator('.alert-results input[type="checkbox"]')).not.toBeChecked();
  expect(pageErrors).toEqual([]);
});
