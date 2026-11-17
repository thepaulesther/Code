import { readFileSync } from 'node:fs';
import { upgradeV2toV3 } from '../src/lib/books';
import { expect, sampleData, stored, storedRaw, test } from './fixtures';

/** Saved data is never overwritten without confirmation, and backups restore exactly. */

const raw = (page: import('@playwright/test').Page) => page.evaluate(() => localStorage.getItem('bp.data'));

test.describe('data Elora can’t use safely is never overwritten', () => {
  test('unreadable data: recovery screen, untouched, start fresh only after a copy is kept', async ({ page, seed }) => {
    const broken = '{"version":2,"transactions":[{"id":"x"';
    await seed(broken);
    await page.goto('/');
    await expect(page.getByText('Elora couldn’t open your saved data')).toBeVisible();
    expect(await raw(page)).toBe(broken);

    const [download] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Download my saved data")')]);
    expect(download.suggestedFilename()).toMatch(/^elora-saved-data-/);

    await page.click('text=Start fresh instead…');
    await expect(page.locator('button:has-text("Start with no data")')).toBeDisabled();
    await page.check('#recovery-understood');
    await page.click('button:has-text("Start with no data")');
    await expect(page.locator('#setup-title')).toBeVisible();
    const kept = await page.evaluate(() => {
      const k = Object.keys(localStorage).find((key) => key.startsWith('bp.unreadable.'));
      return k ? localStorage.getItem(k) : null;
    });
    expect(kept).toBe(broken);
  });

  test('data from a newer version: read-only recovery screen, untouched', async ({ page, seed }) => {
    const newer = JSON.stringify({ ...sampleData(), version: 99 });
    await seed(newer);
    await page.goto('/');
    await expect(page.locator('button:has-text("Reload Elora")')).toBeVisible();
    expect(await raw(page)).toBe(newer);
  });

  test('opening the app writes nothing when nothing changed', async ({ page, seed }) => {
    const text = JSON.stringify(upgradeV2toV3(sampleData()));
    await seed(text);
    await page.goto('/');
    await expect(page.locator('.hero')).toBeVisible();
    expect(await raw(page)).toBe(text);
  });

  test('version 2 data is upgraded once, after a safety copy, with every amount kept', async ({ page, seed }) => {
    const v2 = sampleData();
    const text = JSON.stringify(v2);
    await seed(text);
    await page.goto('/');
    await expect(page.locator('.toast')).toContainText('upgraded');
    const saved = await storedRaw(page);
    expect(saved.version).toBe(3);
    // Amounts are saved in pence/kobo, and read back exactly.
    expect(saved.books.personal.transactions[0].amount).toBe((v2.transactions[0].amount as number) * 100);
    const view = await stored(page);
    for (const key of ['budgets', 'recurring', 'goals'] as const) expect(view[key]).toEqual(v2[key]);
    expect(view.transactions.slice(0, v2.transactions.length)).toEqual(v2.transactions);
    const copies = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('bp.snapshot.v2.')).map((k) => localStorage.getItem(k)));
    expect(copies).toEqual([text]);
  });
});

test('two tabs never overwrite each other, and a newer tab stops older ones saving', async ({ page, context, seed }) => {
  test.skip(test.info().project.name === 'phone', 'Tabs are a desktop concern.');
  await seed(sampleData());
  await page.goto('/#/transactions');
  const other = await context.newPage();
  await other.goto('/#/transactions');

  await other.click('.page-actions .btn-primary');
  await other.fill('#tx-amount', '7.25');
  await other.fill('#tx-note', 'From tab two');
  await other.click('dialog[open] .form-submit button');
  await expect(page.getByText('From tab two')).toBeVisible();

  await page.click('.page-actions .btn-primary');
  await page.fill('#tx-amount', '3');
  await page.fill('#tx-note', 'From tab one');
  await page.click('dialog[open] .form-submit button');
  const notes = (await stored(page)).transactions.map((t: { note: string }) => t.note);
  expect(notes).toEqual(expect.arrayContaining(['From tab two', 'From tab one']));

  const newer = JSON.stringify({ ...(await stored(page)), version: 99 });
  await other.evaluate((t) => localStorage.setItem('bp.data', t), newer);
  await expect(page.getByText('Elora was updated in another tab')).toBeVisible();
  await page.click('.page-actions .btn-primary');
  await page.fill('#tx-amount', '1');
  await page.click('dialog[open] .form-submit button');
  expect(await raw(page)).toBe(newer);
});

test('a full backup restores exactly, after refusing damaged and foreign files', async ({ page, seed }, info) => {
  const data = sampleData();
  await seed(data);
  await page.goto('/#/settings');
  const original = await stored(page);

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Download full backup")')]);
  expect(download.suggestedFilename()).toMatch(/^elora-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const file = info.outputPath('backup.json');
  await download.saveAs(file);
  const backup = JSON.parse(readFileSync(file, 'utf8'));
  expect(backup).toMatchObject({ format: 'elora-backup', counts: { transactions: original.transactions.length, goals: 2 } });
  expect(backup.checksum).toMatch(/^[0-9a-f]{64}$/);

  await page.click('button:has-text("Delete all data")');
  await page.click('button:has-text("Delete everything")');
  await page.goto('/#/settings');
  expect((await stored(page)).transactions).toHaveLength(0);

  await page.click('button:has-text("Restore from backup")');
  const tampered = structuredClone(backup);
  tampered.data.books.personal.transactions[0].amount = 1;
  for (const [text, reason] of [
    [JSON.stringify(tampered), 'checksum'],
    [JSON.stringify({ ...backup, formatVersion: 9 }), 'newer version'],
    ['{"hello":"world"}', 'isn’t an Elora backup'],
  ]) {
    await page.setInputFiles('#restore-file', { name: 'file.json', mimeType: 'application/json', buffer: Buffer.from(text) });
    await expect(page.locator('.restore-problems')).toContainText(reason);
    expect((await stored(page)).transactions).toHaveLength(0);
  }

  await page.setInputFiles('#restore-file', file);
  await expect(page.locator('dialog[open] table.preview')).toContainText(String(original.transactions.length));
  await expect(page.locator('button:has-text("Replace my data")')).toBeDisabled();
  await page.check('#restore-confirm');
  await page.click('button:has-text("Replace my data")');
  const restored = await stored(page);
  for (const key of ['transactions', 'recurring', 'budgets', 'goals'] as const) expect(restored[key]).toEqual(original[key]);
  expect(restored.settings.currency).toBe(original.settings.currency);

  await page.click('.toast .toast-action');
  expect((await stored(page)).transactions).toHaveLength(0);

  await page.goto('/#/settings');
  await page.locator('.snapshots li', { hasText: 'Before deleting everything' }).locator('button:has-text("Restore")').click();
  await page.check('#restore-confirm');
  await page.click('button:has-text("Replace my data")');
  expect((await stored(page)).transactions).toHaveLength(original.transactions.length);
});
