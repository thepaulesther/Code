import { test as base, expect, type Page } from '@playwright/test';

/**
 * Shared test set-up.
 * - Every request that isn't to the local test server is blocked (exchange rates included), so tests
 *   are repeatable and offline.
 * - `seed(data)` puts data in storage once, before the app loads (reloads keep what the app saved).
 */

/** Fictional test data: six months of salary, rent and everyday spending, two goals, four budgets. */
export function sampleData() {
  const today = new Date();
  const ym = (off: number) => {
    const d = new Date(today.getFullYear(), today.getMonth() + off, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  let n = 0;
  const id = () => `seed${n++}`;
  const tx: Record<string, unknown>[] = [];
  for (let m = -5; m <= 0; m++) {
    const M = ym(m);
    const day = (d: number) => `${M}-${String(Math.min(d, m === 0 ? Math.max(1, today.getDate()) : 28)).padStart(2, '0')}`;
    const add = (type: string, amount: number, category: string, note: string, d: number) =>
      tx.push({ id: id(), type, amount, category, note, date: day(d) });
    // Salary and rent repeat every month, as a user would set them up: payments made by the rules.
    tx.push({ id: `r-salary:${M}`, type: 'income', amount: 4200, category: 'Salary', note: 'Acme Ltd salary', date: `${M}-01`, recurringId: 'r-salary' });
    tx.push({ id: `r-rent:${M}`, type: 'expense', amount: 1350, category: 'Housing', note: 'Rent', date: `${M}-01`, recurringId: 'r-rent' });
    if (m % 2) add('income', 650, 'Freelance', 'Logo project', 9);
    add('expense', 310 + m * 12, 'Groceries', 'Weekly shop', 4);
    add('expense', 86.4, 'Dining', 'Dinner with Sam', 6);
    add('expense', 142.1, 'Utilities', 'Power & broadband', 3);
    add('expense', 64, 'Transport', 'Travel card', 2);
    add('expense', 39.99, 'Entertainment', 'Streaming', 5);
    add('expense', 220 - m * 30, 'Shopping', 'Clothes', 7);
  }
  return {
    version: 2,
    transactions: tx,
    budgets: { Groceries: 400, Dining: 150, Shopping: 250, Entertainment: 60 },
    recurring: [
      { id: 'r-salary', type: 'income', amount: 4200, category: 'Salary', note: 'Acme Ltd salary', day: 1, startMonth: ym(-5), lastGenerated: ym(0) },
      { id: 'r-rent', type: 'expense', amount: 1350, category: 'Housing', note: 'Rent', day: 1, startMonth: ym(-5), lastGenerated: ym(0) },
      { id: 'r1', type: 'expense', amount: 12.99, category: 'Entertainment', note: 'Music subscription', day: 28, startMonth: ym(1) },
    ],
    goals: [
      { id: 'g1', name: 'Emergency fund', kind: 'emergency', target: 7500, contributions: [{ id: 'c1', date: `${ym(-2)}-10`, amount: 2600 }] },
      { id: 'g2', name: 'New car', kind: 'goal', target: 12000, targetMonth: ym(18), contributions: [{ id: 'c2', date: `${ym(-1)}-10`, amount: 1800 }] },
    ],
    settings: {
      currency: 'GBP',
      theme: 'light',
      expenseCategories: ['Housing', 'Groceries', 'Dining', 'Transport', 'Utilities', 'Health', 'Entertainment', 'Shopping', 'Other'],
      incomeCategories: ['Salary', 'Freelance', 'Gifts', 'Other income'],
    },
  };
}

export type SampleData = ReturnType<typeof sampleData>;

export const test = base.extend<{
  /** Store `raw` (an object, or exact text) as the saved data before the first page load. */
  seed: (raw: unknown) => Promise<void>;
  /** Console errors and uncaught page errors seen during the test. */
  pageErrors: string[];
}>({
  context: async ({ context, baseURL }, use) => {
    await context.route('**/*', (route) =>
      route.request().url().startsWith(baseURL ?? 'http://localhost') ? route.continue() : route.abort(),
    );
    await use(context);
  },
  seed: async ({ page }, use) => {
    await use(async (raw) => {
      const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
      await page.addInitScript((t) => {
        if (sessionStorage.getItem('e2e-seeded')) return;
        localStorage.clear();
        localStorage.setItem('bp.data', t);
        sessionStorage.setItem('e2e-seeded', '1');
      }, text);
    });
  },
  pageErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // Blocked exchange-rate requests log network errors; those are expected here.
    page.on('console', (m) => {
      if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED|net::/.test(m.text())) errors.push(m.text());
    });
    await use(errors);
  },
});

export { expect };

export const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1000) < 600;

/** The saved data, parsed. */
export const stored = async (page: Page) => JSON.parse((await page.evaluate(() => localStorage.getItem('bp.data'))) ?? 'null');

/** Open the add-transaction sheet from wherever the page offers it. */
export async function openAdd(page: Page, kind: 'expense' | 'income' = 'expense') {
  const quick = page.locator(`button.qa:has-text("Add ${kind}")`);
  if (await quick.isVisible()) return quick.click();
  if (isPhone(page)) await page.click('.fab');
  else await page.click('.page-actions .btn-primary:has-text("Add transaction")');
  if (kind === 'income') await page.click('dialog[open] [role="radio"]:has-text("Income")');
}
