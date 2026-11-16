import AxeBuilder from '@axe-core/playwright';
import { expect, openAdd, sampleData, test } from './fixtures';

/** axe-core WCAG 2.2 A and AA checks on every page and the main dialogs, light and dark. */
const PAGES = ['/', '/#/transactions', '/#/budgets', '/#/savings', '/#/insights', '/#/plans', '/#/settings'];
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const check = async (page: import('@playwright/test').Page) => {
  // Let dialogs finish fading in: half-transparent text would be measured at the wrong contrast.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return violations.map((v) => `${v.id} (${v.nodes.length}): ${v.nodes[0]?.target.join(' ')}`);
};

for (const theme of ['light', 'dark'] as const) {
  for (const style of ['tide', 'forest'] as const) {
    test(`every page meets WCAG 2.2 AA (${style}, ${theme})`, async ({ page, seed }) => {
      await seed({ ...sampleData(), settings: { ...sampleData().settings, theme } });
      if (style === 'forest') await page.addInitScript(() => localStorage.setItem('elora.style', '"forest"'));
      const found: string[] = [];
      for (const path of PAGES) {
        await page.goto(path);
        await expect(page.locator('#page-title')).toBeVisible();
        found.push(...(await check(page)).map((v) => `${path}: ${v}`));
      }
      expect(found).toEqual([]);
    });
  }

  test(`new user, add sheet and restore dialog meet WCAG 2.2 AA (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/');
    await expect(page.locator('#setup-title')).toBeVisible();
    const found = await check(page);
    await page.selectOption('#welcome-currency', 'GBP');
    await openAdd(page, 'income');
    found.push(...(await check(page)));
    await page.keyboard.press('Escape');
    await page.goto('/#/settings');
    await page.click('button:has-text("Restore from backup")');
    found.push(...(await check(page)));
    expect(found).toEqual([]);
  });
}
