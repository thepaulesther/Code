import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, stored, test } from './fixtures';

/** Stage 1: the Upcoming module, the month-end check-in and customising the Overview. Fixed dates via a fake clock. */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const axe = async (page: Page) => {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return violations.map((v) => `${v.id} (${v.nodes.length}): ${v.nodes[0]?.target.join(' ')}`);
};

const settings = {
  currency: 'NGN',
  theme: 'light',
  expenseCategories: ['Housing', 'Groceries', 'Utilities', 'Transport', 'Other'],
  incomeCategories: ['Salary', 'Other income'],
};
const tx = (id: string, type: 'income' | 'expense', amount: number, category: string, date: string, recurringId?: string) => ({
  id, type, amount, category, note: id, date, ...(recurringId ? { recurringId } : {}),
});

/** October: ₦500,000 salary, ₦450,000 spent (₦50,000 left over). November: salary and rent on the 1st. */
function data(extra: Record<string, unknown> = {}) {
  return {
    version: 2,
    transactions: [
      tx('Salary', 'income', 500_000, 'Salary', '2026-10-01', 'r-salary'),
      tx('Rent', 'expense', 150_000, 'Housing', '2026-10-01', 'r-rent'),
      tx('Groceries', 'expense', 300_000, 'Groceries', '2026-10-12'),
      tx('Rent Nov', 'expense', 150_000, 'Housing', '2026-11-01', 'r-rent'),
      tx('Salary Nov', 'income', 500_000, 'Salary', '2026-11-01', 'r-salary'),
    ],
    budgets: {},
    recurring: [
      { id: 'r-salary', type: 'income', amount: 500_000, category: 'Salary', note: 'Salary', day: 1, startMonth: '2026-10', lastGenerated: '2026-11' },
      { id: 'r-rent', type: 'expense', amount: 150_000, category: 'Housing', note: 'Rent', day: 1, startMonth: '2026-10', lastGenerated: '2026-11' },
      { id: 'r-power', type: 'expense', amount: 30_000, category: 'Utilities', note: 'Electricity', day: 30, startMonth: '2026-10', lastGenerated: '2026-10' },
      { id: 'r-gym', type: 'expense', amount: 9_000, category: 'Other', note: 'Gym', day: 15, startMonth: '2026-10', lastGenerated: '2026-10', paused: true },
    ],
    goals: [
      { id: 'g-fund', name: 'Emergency fund', kind: 'emergency', target: 600_000, contributions: [] },
      { id: 'g-car', name: 'Car', kind: 'goal', target: 2_000_000, contributions: [] },
    ],
    settings,
    ...extra,
  };
}

const at = async (page: Page, iso: string) => page.clock.install({ time: new Date(`${iso}T10:00:00`) });
/** The Overview's section headings, in the order shown. */
const sectionOrder = (page: Page) =>
  page.locator('.section-grid > div').evaluateAll((els) =>
    els.map((el) => (el.querySelector('h2')?.firstChild?.textContent ?? '').trim()),
  );

test.describe('Upcoming', () => {
  test('near the month end it shows the rest of the month and early next month, with this month’s total only', async ({ page, seed }) => {
    await at(page, '2026-11-28');
    await seed(data());
    await page.goto('/');
    const card = page.locator('.coming-up');
    const later = card.locator('.coming-up-group', { hasText: 'Later this month' });
    await expect(later).toContainText('Electricity');
    await expect(later).toContainText('In 2 days');
    const early = card.locator('.coming-up-group', { hasText: 'Early next month' });
    await expect(early).toContainText('Rent');
    await expect(early).toContainText('Salary');
    // Totals are for this month only (electricity), matching "Still to pay".
    await expect(card.locator('.card-sub')).toHaveText(/^This month: ₦30,000(\.00)? to pay$/);
    await expect(page.locator('.hero-facts')).toContainText('Still to pay this month₦30,000');
    // The paused gym membership is counted, with a way to manage it.
    await expect(card).toContainText('1 paused item isn’t included.');
    await card.getByRole('link', { name: 'Manage repeating items' }).click();
    await expect(page.locator('#page-title')).toHaveText('Transactions');
  });

  test('says when nothing else is due, and shows today’s automatic payments', async ({ page, seed }) => {
    await at(page, '2026-11-30');
    await seed(data());
    await page.goto('/');
    const card = page.locator('.coming-up');
    await expect(card.locator('.coming-up-group', { hasText: 'Added today' })).toContainText('Electricity');
    await expect(card).toContainText('Nothing else due this month.');
    expect((await stored(page)).transactions.some((t: { id: string }) => t.id === 'r-power:2026-11')).toBe(true);
  });

  test('with no repeating items it offers to add one, already set to repeat', async ({ page, seed }) => {
    await at(page, '2026-11-14');
    await seed(data({ recurring: [] }));
    await page.goto('/');
    await page.click('.coming-up button:has-text("Add a repeating bill")');
    await expect(page.locator('dialog[open] #tx-repeat')).toHaveValue('1');
    await page.keyboard.press('Escape');
    // An ordinary "Add expense" afterwards doesn't repeat.
    await page.click('button.qa:has-text("Add expense")');
    await expect(page.locator('dialog[open] #tx-repeat')).toHaveValue('0');
  });
});

test.describe('Month-end check-in', () => {
  test('left-over money goes to goals, dated the last day of that month, and can be undone', async ({ page, seed }) => {
    await at(page, '2026-11-03');
    await seed(data());
    await page.goto('/');
    const card = page.locator('.month-end');
    await expect(card.locator('h2')).toHaveText(/^You finished October with ₦50,000(\.00)? left over$/);
    await card.getByRole('button', { name: 'Add to goals' }).click();
    await page.fill('#left-over-g-fund', '60000');
    await card.getByRole('button', { name: 'Save to goals' }).click();
    await expect(card.locator('.error')).toContainText(/more than the ₦50,000(\.00)? left over/);
    await page.fill('#left-over-g-fund', '30000');
    await page.fill('#left-over-g-car', '20000');
    await expect(card).toContainText('All of it is assigned.');
    await card.getByRole('button', { name: 'Save to goals' }).click();
    await expect(page.locator('.toast')).toContainText(/Added ₦50,000(\.00)? left over from October 2026 to 2 goals\./);
    await expect(card).toHaveCount(0);
    const goals = (await stored(page)).goals;
    expect(goals[0].contributions).toEqual([expect.objectContaining({ date: '2026-10-31', amount: 30_000 })]);
    expect(goals[1].contributions).toEqual([expect.objectContaining({ date: '2026-10-31', amount: 20_000 })]);

    await page.click('.toast .toast-action');
    await expect(card).toBeVisible();
    expect((await stored(page)).goals[0].contributions).toEqual([]);
  });

  test('“Not now” hides it for that month, after a reload too; looking back at October still offers it', async ({ page, seed }) => {
    await at(page, '2026-11-02');
    await seed(data());
    await page.goto('/');
    await page.locator('.month-end').getByRole('button', { name: 'Not now' }).click();
    await expect(page.locator('.month-end')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('.hero')).toBeVisible();
    await expect(page.locator('.month-end')).toHaveCount(0);
    await page.getByRole('button', { name: 'Previous month' }).first().click();
    await expect(page.locator('.month-end h2')).toHaveText(/^You finished October with ₦50,000(\.00)? left over$/);
    await expect(page.locator('.month-end').getByRole('button', { name: 'Not now' })).toHaveCount(0);
  });

  test('is only offered in the first week of the month', async ({ page, seed }) => {
    await at(page, '2026-11-08');
    await seed(data());
    await page.goto('/');
    await expect(page.locator('.hero')).toBeVisible();
    await expect(page.locator('.month-end')).toHaveCount(0);
  });

  test('a month that spent more than it earned gets a calm note and a link to its spending', async ({ page, seed }) => {
    await at(page, '2026-11-04');
    const over = data();
    over.transactions.push(tx('Repairs', 'expense', 62_000, 'Other', '2026-10-20'));
    await seed(over);
    await page.goto('/');
    const card = page.locator('.month-end.over');
    await expect(card.locator('h2')).toHaveText(/^October ended ₦12,000(\.00)? over$/);
    await card.getByRole('button', { name: 'See October’s spending' }).click();
    await expect(page.locator('#page-title')).toHaveText('Transactions');
    await expect(page.locator('.month-name').first()).toHaveText(/October 2026/);
  });

  test('with no goals yet it offers to create one', async ({ page, seed }) => {
    await at(page, '2026-11-03');
    await seed(data({ goals: [] }));
    await page.goto('/');
    await page.locator('.month-end').getByRole('button', { name: 'Create a goal' }).click();
    await expect(page.locator('dialog[open] #goal-target')).toBeVisible();
  });
});

test.describe('Customise Overview', () => {
  test('sections can be moved and hidden by keyboard; the choice survives a reload and can be reset', async ({ page, seed }) => {
    await at(page, '2026-11-14');
    await seed(data());
    await page.goto('/');
    await expect(page.locator('.coming-up')).toBeVisible();
    const defaults = await sectionOrder(page);
    expect(defaults.slice(0, 2)).toEqual(['Coming up', 'Budgets this month']);
    expect(defaults).toContain('Insights');

    await page.getByRole('button', { name: 'Customise Overview' }).click();
    const dialog = page.locator('dialog[open]');
    await dialog.getByRole('button', { name: 'Move Budgets up' }).focus();
    await page.keyboard.press('Enter');
    // Budgets is now first: its "up" button is disabled, so focus moves to "down".
    await expect(dialog.getByRole('button', { name: 'Move Budgets down' })).toBeFocused();
    await expect(dialog.locator('[aria-live]')).toHaveText('Budgets moved to position 1 of 6.');
    await dialog.getByRole('checkbox', { name: 'Insights' }).uncheck();
    await dialog.getByRole('button', { name: 'Done' }).click();

    await expect.poll(async () => (await sectionOrder(page)).slice(0, 2)).toEqual(['Budgets this month', 'Coming up']);
    expect(await sectionOrder(page)).not.toContain('Insights');
    const saved = JSON.parse((await page.evaluate(() => localStorage.getItem('elora.layout'))) ?? '{}');
    expect(saved.order.slice(0, 2)).toEqual(['budgets', 'upcoming']);
    expect(saved.hidden).toEqual(['insights']);

    await page.reload();
    await expect(page.locator('.coming-up')).toBeVisible();
    expect((await sectionOrder(page)).slice(0, 2)).toEqual(['Budgets this month', 'Coming up']);

    await page.getByRole('button', { name: 'Customise Overview' }).click();
    await dialog.getByRole('button', { name: 'Reset to default' }).click();
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect.poll(() => sectionOrder(page)).toEqual(defaults);
  });

  test('a damaged layout setting falls back to the default', async ({ page, seed }) => {
    await at(page, '2026-11-14');
    await seed(data());
    await page.addInitScript(() => localStorage.setItem('elora.layout', '{"order": 7, "hidden": ["nope"]'));
    await page.goto('/');
    await expect(page.locator('.coming-up')).toBeVisible();
    expect((await sectionOrder(page)).slice(0, 2)).toEqual(['Coming up', 'Budgets this month']);
  });

  test('can also be opened from Settings', async ({ page, seed }) => {
    await at(page, '2026-11-14');
    await seed(data());
    await page.goto('/#/settings');
    await page.locator('.settings').getByRole('button', { name: 'Customise Overview' }).click();
    await expect(page.locator('dialog[open] .customise-list li')).toHaveCount(6);
  });
});

for (const theme of ['light', 'dark'] as const) {
  test(`the new Overview cards and the customise dialog meet WCAG 2.2 AA (${theme})`, async ({ page, seed }) => {
    await at(page, '2026-11-28');
    await seed(data({ settings: { ...settings, theme } }));
    await page.goto('/');
    await expect(page.locator('.coming-up')).toBeVisible();
    const found = await axe(page);
    await page.clock.setSystemTime(new Date('2026-12-03T10:00:00'));
    await page.reload();
    await expect(page.locator('.month-end')).toBeVisible();
    await page.locator('.month-end').getByRole('button', { name: 'Add to goals' }).click();
    found.push(...(await axe(page)));
    await page.getByRole('button', { name: 'Customise Overview' }).click();
    found.push(...(await axe(page)));
    expect(found).toEqual([]);
  });
}
