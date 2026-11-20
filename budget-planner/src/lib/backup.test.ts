import { describe, expect, it } from 'vitest';
import { createBackup, parseBackup, validateAppData } from './backup';
import { storeFromView } from './books';
import { defaultSettings, type AppData } from './store';

const data = (): AppData => ({
  version: 2,
  transactions: [
    { id: 't1', type: 'income', amount: 500_000, category: 'Salary', note: 'November salary', date: '2026-11-01' },
    { id: 't2', type: 'expense', amount: 3_000_000, category: 'Housing', note: 'Rent', date: '2026-01-05', spread: 12 },
    { id: 't3', type: 'expense', amount: 7_400, category: 'Dining', note: 'Lunch', date: '2026-11-04', original: { amount: 5, currency: 'USD', rate: 1480 } },
  ],
  budgets: { Dining: 40_000 },
  recurring: [{ id: 'r1', type: 'expense', amount: 4_500, category: 'Entertainment', note: 'Music', day: 28, startMonth: '2026-12' }],
  goals: [{ id: 'g1', name: 'Emergency fund', kind: 'emergency', target: 1_500_000, contributions: [{ id: 'c1', date: '2026-10-10', amount: 200_000 }] }],
  settings: { ...defaultSettings(), currency: 'NGN', theme: 'dark' },
  alertLog: { '2026-11': 'near-plan' },
});
const store = () => storeFromView(data());

describe('backup round trip', () => {
  it('restores exactly what was backed up', async () => {
    const original = store();
    const r = await parseBackup(await createBackup(original, new Date('2026-11-14T20:00:00Z')));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toEqual(original);
    expect(r.info).toMatchObject({
      kind: 'backup',
      exportedAt: '2026-11-14T20:00:00.000Z',
      counts: { transactions: 3, repeating: 1, budgets: 1, goals: 1 },
      currency: 'NGN',
      firstDate: '2026-01-05',
      lastDate: '2026-11-04',
      upgradedFrom: null,
      checksum: 'verified',
    });
  });

  it('includes settings, goals, repeating items and alert history', async () => {
    const file = JSON.parse(await createBackup(store()));
    expect(file).toMatchObject({ format: 'elora-backup', formatVersion: 1, dataVersion: 4 });
    expect(file.data.settings.theme).toBe('dark');
    expect(file.data.books.personal.goals[0].contributions).toHaveLength(1);
    expect(file.data.books.personal.alertLog).toEqual({ '2026-11': 'near-plan' });
    // Amounts are saved in kobo.
    expect(file.data.books.personal.transactions[0].amount).toBe(50_000_000);
  });
});

describe('parseBackup refuses unsafe files', () => {
  it('rejects text that isn’t JSON, or isn’t Elora data', async () => {
    expect(await parseBackup('not json')).toMatchObject({ ok: false });
    expect(await parseBackup('{"hello":1}')).toMatchObject({ ok: false });
  });

  it('rejects a file edited after it was made', async () => {
    const file = JSON.parse(await createBackup(store()));
    file.data.books.personal.transactions[0].amount = 1;
    const r = await parseBackup(JSON.stringify(file));
    expect(r).toMatchObject({ ok: false, problems: [expect.stringContaining('checksum')] });
  });

  it('rejects a file whose counts don’t match its records', async () => {
    const file = JSON.parse(await createBackup(store()));
    file.counts.transactions = 9;
    expect(await parseBackup(JSON.stringify(file))).toMatchObject({ ok: false, problems: [expect.stringContaining('number of records')] });
  });

  it('rejects backups and data from a newer version', async () => {
    const file = JSON.parse(await createBackup(store()));
    expect(await parseBackup(JSON.stringify({ ...file, formatVersion: 2 }))).toMatchObject({ ok: false });
    expect(await parseBackup(JSON.stringify({ ...data(), version: 4 }))).toMatchObject({ ok: false });
  });
});

describe('parseBackup accepts saved data', () => {
  it('reads raw saved data (a recovery download or safety copy), without a checksum', async () => {
    const r = await parseBackup(JSON.stringify(data()));
    expect(r).toMatchObject({ ok: true, info: { kind: 'saved-data', checksum: 'missing' } });
  });

  it('upgrades the original format', async () => {
    const r = await parseBackup(JSON.stringify({ version: 1, transactions: data().transactions, budgets: {} }));
    expect(r).toMatchObject({ ok: true, info: { upgradedFrom: 1, currency: 'USD' } });
  });
});

describe('validateAppData', () => {
  const broken = (change: (d: AppData & Record<string, unknown>) => void) => {
    const d = structuredClone(data()) as AppData & Record<string, unknown>;
    change(d);
    return validateAppData(d);
  };

  it('accepts good data', () => {
    expect(validateAppData(data())).toEqual([]);
  });

  it.each([
    ['a negative amount', (d: AppData) => { d.transactions[0].amount = -5; }, 'amount'],
    ['an infinite amount', (d: AppData) => { d.transactions[0].amount = Infinity; }, 'amount'],
    ['an impossible date', (d: AppData) => { d.transactions[0].date = '2026-02-30'; }, 'date'],
    ['a repeated id', (d: AppData) => { d.transactions[1].id = 't1'; }, 'repeats the id'],
    ['an unknown type', (d: AppData) => { (d.transactions[0] as { type: string }).type = 'gift'; }, 'neither'],
    ['a zero exchange rate', (d: AppData) => { d.transactions[2].original!.rate = 0; }, 'exchange rate'],
    ['an odd spread', (d: AppData) => { d.transactions[1].spread = 1.5; }, 'spread'],
    ['a text budget', (d: AppData) => { (d.budgets as Record<string, unknown>).Dining = 'lots'; }, 'budget'],
    ['a bad repeating day', (d: AppData) => { d.recurring[0].day = 32; }, 'day of the month'],
    ['a bad start month', (d: AppData) => { d.recurring[0].startMonth = '2026-13'; }, 'start month'],
    ['a goal without contributions', (d: AppData) => { (d.goals![0] as unknown as Record<string, unknown>).contributions = null; }, 'contribution'],
    ['an unknown theme', (d: AppData) => { (d.settings as unknown as Record<string, unknown>).theme = 'neon'; }, 'theme'],
  ])('reports %s', (_name, change, words) => {
    const problems = broken(change as (d: AppData & Record<string, unknown>) => void);
    expect(problems.join(' ')).toContain(words);
  });
});
