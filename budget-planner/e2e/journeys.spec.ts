import { expect, isPhone, openAdd, sampleData, stored, test } from './fixtures';

/** Core journeys, on desktop and phone (see the projects in playwright.config.ts). */

test('a new user sets up, adds income and spending, and can undo', async ({ page, pageErrors }) => {
  await page.goto('/');
  await expect(page.locator('#setup-title')).toBeVisible();
  await expect(page.getByText('What you’ll see here')).toBeVisible();

  await page.selectOption('#welcome-currency', 'NGN');
  expect((await stored(page)).settings.currency).toBe('NGN');

  await page.click('.setup-actions button:has-text("Add income")');
  await expect(page.locator('dialog[open] [role="radio"][aria-checked="true"]')).toHaveText(/Income/);
  await expect(page.locator('#tx-amount')).toBeFocused();
  await page.fill('#tx-amount', '500000');
  await page.fill('#tx-note', 'Salary');
  await page.click('dialog[open] .form-submit button');
  await expect(page.locator('.setup-step.is-current .setup-title')).toHaveText('Record your spending');

  await openAdd(page, 'expense');
  await page.fill('#tx-amount', '12500');
  await page.selectOption('#tx-category', 'Dining');
  await page.click('dialog[open] .form-submit button');
  expect((await stored(page)).transactions).toHaveLength(2);
  await expect(page.locator('.hero-value')).toContainText('487,500');

  await page.click('.toast .toast-action');
  expect((await stored(page)).transactions).toHaveLength(1);
  expect(pageErrors).toEqual([]);
});

test('transactions can be edited, deleted, searched and filtered', async ({ page, seed, pageErrors }) => {
  await seed(sampleData());
  await page.goto('/#/transactions');
  const rows = page.locator('.rows li');
  const before = await rows.count();

  await rows.filter({ hasText: 'Dinner with Sam' }).locator('.icon-btn.edit').click();
  await page.fill('dialog[open] #tx-amount', '99');
  await page.click('dialog[open] .form-submit button');
  expect((await stored(page)).transactions.some((t: { amount: number }) => t.amount === 99)).toBe(true);

  await rows.filter({ hasText: 'Dinner with Sam' }).locator('.icon-btn.danger').click();
  await expect(rows).toHaveCount(before - 1);

  await page.fill('#tx-search', 'nothing-matches');
  await expect(page.getByText('Nothing matches these filters')).toBeVisible();
  await page.click('.empty-state button:has-text("Clear filters")');
  await expect(rows).toHaveCount(before - 1);

  await page.selectOption('#tx-category-filter', 'Salary');
  await expect(rows).toHaveCount(1);
  await expect(page.locator('.active-filters')).toContainText('Salary');
  await page.click('.active-filters button');
  await expect(rows).toHaveCount(before - 1);
  expect(pageErrors).toEqual([]);
});

test('a repeating bill is created and can be paused', async ({ page, seed }) => {
  await seed({ ...sampleData(), recurring: [] });
  await page.goto('/#/transactions');
  await openAdd(page, 'expense');
  await page.fill('#tx-amount', '15');
  await page.selectOption('#tx-category', 'Entertainment');
  await page.fill('#tx-note', 'Music');
  await page.selectOption('#tx-repeat', '1');
  await page.click('dialog[open] .form-submit button');
  const d = await stored(page);
  expect(d.recurring).toHaveLength(1);
  expect(d.transactions.some((t: { recurringId?: string }) => t.recurringId)).toBe(true);
  await page.click('.rec-actions button:has-text("Pause")');
  expect((await stored(page)).recurring[0].paused).toBe(true);
});

test('budgets are set and an over-budget category says so in words', async ({ page, seed }) => {
  await seed({ ...sampleData(), budgets: {} });
  await page.goto('/#/budgets');
  await page.click('button:has-text("Set budgets")');
  await page.fill('#budget-Groceries', '400');
  await page.fill('#budget-Entertainment', '10');
  await page.click('.budgets button:has-text("Save")');
  expect((await stored(page)).budgets).toMatchObject({ Groceries: 400, Entertainment: 10 });
  await expect(page.locator('.state-over .budget-status')).toContainText('Over limit');
});

test('an emergency fund goal is created from the Overview and money added', async ({ page, seed }) => {
  await seed({ ...sampleData(), goals: [] });
  await page.goto('/');
  await page.click('button.qa:has-text("New goal")');
  await page.click('dialog[open] .chip:has-text("Emergency fund")');
  await page.fill('#goal-target', '5000');
  await page.click('dialog[open] button[type=submit]');
  expect((await stored(page)).goals[0].kind).toBe('emergency');
  await page.goto('/#/savings');
  await page.click('.goal-actions button:has-text("Add money")');
  await page.fill('.goal-money input', '250');
  await page.click('.goal-money button[type=submit]');
  const g = (await stored(page)).goals[0];
  expect(g.contributions.reduce((s: number, c: { amount: number }) => s + c.amount, 0)).toBe(250);
});

test('the plan explains its income and takes an expected income', async ({ page, seed }) => {
  await seed(sampleData());
  await page.goto('/#/plans');
  await expect(page.locator('.plan-income')).toContainText('Planned on');
  await expect(page.getByText('How these numbers are worked out')).toBeVisible();
  await page.click('button:has-text("Change income")');
  await page.fill('#plan-income', '3500');
  await page.click('.income-editor button[type=submit]');
  expect((await stored(page)).settings.plan.income).toBe(3500);
});

test('CSV import adds new rows, and export downloads every transaction', async ({ page, seed }) => {
  await seed(sampleData());
  await page.goto('/#/transactions');
  if (isPhone(page)) {
    await page.click('.tabbar button');
    await page.click('dialog[open] button:has-text("Import CSV")');
  } else await page.click('.page-actions button:has-text("Import")');
  await page.click('dialog[open] .paste summary');
  await page.fill('dialog[open] .paste textarea', 'Date,Description,Amount\n2026-11-02,Coffee,-3.50\n2026-11-03,Refund,12.00');
  await page.click('dialog[open] .paste button');
  await page.click('dialog[open] .modal-foot .btn-primary');
  const after = await stored(page);
  expect(after.transactions.some((t: { note: string; amount: number }) => t.note === 'Coffee' && t.amount === 3.5)).toBe(true);

  if (isPhone(page)) {
    await page.click('.tabbar button');
    await page.click('dialog[open] button:has-text("Export CSV")');
  } else await page.click('.page-actions button:has-text("Export")');
  const csv = await page.inputValue('#export-csv');
  expect(csv.split('\n')[0]).toMatch(/^date,type,category,amount,note/);
  expect(csv.trim().split('\n')).toHaveLength(after.transactions.length + 1);
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('dialog[open] button:has-text("Download")')]);
  expect(download.suggestedFilename()).toMatch(/^elora-\d{4}-\d{2}-\d{2}\.csv$/);
});

test('settings: theme, category rename and deleting everything', async ({ page, seed }) => {
  await seed(sampleData());
  await page.goto('/#/settings');
  await page.click('.segmented [role=radio]:has-text("Dark")');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.click('.segmented [role=radio]:has-text("Light")');

  await page.locator('.cat-list li', { hasText: 'Dining' }).locator('button:has-text("Rename")').click();
  await page.fill('#rename-expense-Dining', 'Eating out');
  await page.keyboard.press('Enter');
  const d = await stored(page);
  expect(d.settings.expenseCategories).toContain('Eating out');
  expect(d.transactions.some((t: { category: string }) => t.category === 'Eating out')).toBe(true);

  await page.click('button:has-text("Delete all data")');
  await page.click('button:has-text("Delete everything")');
  expect((await stored(page)).transactions).toHaveLength(0);
  await expect(page.locator('#setup-title')).toBeVisible();
});

test('navigation: back button, unknown pages, active state and the keyboard', async ({ page, seed }) => {
  await seed(sampleData());
  await page.goto('/#/budgets');
  await page.goto('/#/insights');
  await page.goBack();
  await expect(page.locator('#page-title')).toHaveText('Budgets');
  await page.goto('/#/no-such-page');
  await expect(page.locator('.hero')).toBeVisible();
  if (isPhone(page)) {
    await expect(page.locator('.tab.is-active')).toHaveAttribute('href', '#/');
  } else {
    await expect(page.locator('.nav-item.is-active')).toHaveAttribute('href', '#/');
    await page.goto('/#/insights');
    const month = await page.locator('.month-name').textContent();
    await page.locator('.trend-col').first().focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.month-name')).not.toHaveText(month ?? '');
  }
});

test('month comparisons stop at the same day while the month is running', async ({ page, seed }) => {
  test.skip(new Date().getDate() >= 28, 'Late in the month the comparison may cover whole months.');
  await seed(sampleData());
  await page.goto('/');
  await expect(page.locator('.hero-flow-delta').first()).toContainText('same day last month');
});

test('repeating bills: upcoming ones are shown, added on their day, and the balance reconciles with the plan', async ({ page }) => {
  // The case reported in review: bills due later in the month seemed not to repeat, and the balance
  // didn't match the plan's Left to spend.
  await page.clock.install({ time: new Date('2026-11-14T10:00:00') });
  await page.goto('/');
  await page.selectOption('#welcome-currency', 'NGN');
  const add = async (type: 'income' | 'expense', amount: number, category: string, note: string, date: string) => {
    await openAdd(page, type);
    await page.fill('#tx-amount', String(amount));
    await page.selectOption('#tx-category', category);
    await page.fill('#tx-note', note);
    await page.fill('#tx-date', date);
    await page.selectOption('#tx-repeat', '1');
    await page.click('dialog[open] .form-submit button');
  };
  await add('income', 500000, 'Salary', 'Salary', '2026-11-01');
  await add('expense', 150000, 'Housing', 'Rent', '2026-11-01');
  await add('expense', 30000, 'Utilities', 'Electricity', '2026-11-20');
  await add('expense', 10000, 'Utilities', 'Phone plan', '2026-11-28');
  await openAdd(page, 'expense');
  await page.fill('#tx-amount', '60000');
  await page.selectOption('#tx-category', 'Groceries');
  await page.click('dialog[open] .form-submit button');

  // Upcoming bills are visible, and the hero shows what's still to pay.
  await page.goto('/');
  const coming = page.locator('.coming-up');
  await expect(coming).toContainText('Electricity');
  await expect(coming).toContainText('Phone plan');
  await expect(page.locator('.hero-value')).toContainText('290,000');
  await expect(page.locator('.hero-facts')).toContainText('Still to pay this month₦40,000');
  await expect(page.locator('.hero-facts')).toContainText('250,000');

  // The plan explains the gap line by line, and it adds up.
  await page.goto('/#/plans');
  const bridge = page.locator('.plan-bridge');
  await expect(bridge).toContainText('Balance this month');
  await expect(bridge).toContainText('290,000');
  await expect(bridge).toContainText('Bills not yet paid');
  await expect(bridge).toContainText('− ₦40,000');
  await expect(bridge.locator('.plan-bridge-total')).toContainText('250,000');

  // The app stays open into the 21st: electricity is added automatically within a minute, with no
  // reload; only the phone bill is still to come.
  await page.clock.setSystemTime(new Date('2026-11-21T10:00:00'));
  await page.clock.runFor(61_000);
  await page.goto('/#/transactions');
  await expect(page.locator('.rows li', { hasText: 'Electricity' })).toBeVisible();
  await expect(page.locator('.coming-up')).not.toContainText('Electricity');
  await expect(page.locator('.coming-up')).toContainText('Phone plan');

  // Still open into December: the app moves to the new month, and salary and rent repeat on the 1st.
  await page.clock.setSystemTime(new Date('2026-12-02T10:00:00'));
  await page.clock.runFor(61_000);
  await page.goto('/#/transactions');
  await expect(page.locator('.month-name')).toHaveText(/December 2026/);
  await expect(page.locator('.rows li', { hasText: 'Salary' })).toBeVisible();
  await expect(page.locator('.rows li', { hasText: 'Rent' })).toBeVisible();
});

test('the brand: dawn-over-tide mark and the "elora" wordmark, with a readable name', async ({ page, seed }) => {
  await seed(sampleData());
  await page.goto('/');
  const brand = isPhone(page) ? page.locator('.topbar-mobile .brand') : page.locator('.sidebar .brand');
  await expect(brand.locator('.brand-mark')).toBeVisible();
  await expect(brand.getByRole('img', { name: 'Elora' })).toBeVisible();
});
