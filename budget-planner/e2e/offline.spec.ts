import { expect, sampleData, test } from './fixtures';

test('the app loads with the network off once it has been opened', async ({ page, context, seed }) => {
  await seed(sampleData());
  await page.goto('/');
  // Wait for the service worker to take control, then load once more so it caches the app.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.locator('.hero')).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#page-title')).toBeVisible();
  await expect(page.locator('.hero-value')).not.toBeEmpty();
  await context.setOffline(false);
});
