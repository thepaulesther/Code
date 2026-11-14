import { expect, sampleData, test } from './fixtures';

/**
 * Every page at every supported width, light and dark: no sideways scrolling, no clipped text, and
 * on phones the floating add button never covers the end of a page.
 */
const WIDTHS = [375, 390, 430, 600, 768, 1023, 1024, 1440];
const PAGES = ['/', '/#/transactions', '/#/budgets', '/#/savings', '/#/insights', '/#/plans', '/#/settings'];

for (const theme of ['light', 'dark'] as const) {
  test(`layout holds at every width (${theme})`, async ({ page, seed }) => {
    test.skip(test.info().project.name !== 'desktop', 'The widths are set explicitly; one project is enough.');
    await seed({ ...sampleData(), settings: { ...sampleData().settings, theme } });
    const problems: string[] = [];
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: width < 600 ? 760 : 900 });
      for (const path of PAGES) {
        await page.goto(path);
        await expect(page.locator('#page-title')).toBeVisible();
        const found = await page.evaluate(() => {
          const out: string[] = [];
          const extra = document.documentElement.scrollWidth - window.innerWidth;
          if (extra > 0) out.push(`scrolls sideways by ${extra}px`);
          for (const el of document.querySelectorAll<HTMLElement>(
            'h1,h2,h3,.stat-value,.hero-value,.hero-flow-value,.plan-lead-value,.qa-text,.tab,.nav-text,.btn-primary,.btn-secondary,.month-name,.goal-figures,.budget-nums',
          )) {
            const cs = getComputedStyle(el);
            if (cs.textOverflow === 'ellipsis' || el.offsetParent === null) continue;
            if (el.scrollWidth > el.clientWidth + 1 && cs.overflow !== 'visible') out.push(`clipped: "${el.textContent?.trim().slice(0, 30)}"`);
          }
          return out;
        });
        problems.push(...found.map((f) => `${width}px ${path}: ${f}`));
        if (width < 600) {
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
          const covered = await page.evaluate(() => {
            const fab = document.querySelector('.fab');
            const last = document.querySelector('.page')?.lastElementChild;
            if (!fab || !last) return 0;
            const f = fab.getBoundingClientRect();
            const l = last.getBoundingClientRect();
            return l.bottom > f.top && l.right > f.left ? Math.round(l.bottom - f.top) : 0;
          });
          if (covered) problems.push(`${width}px ${path}: add button covers the end of the page by ${covered}px`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
}
