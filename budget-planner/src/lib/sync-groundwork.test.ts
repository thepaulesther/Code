import { describe, expect, it } from 'vitest';
import {
  addRepeatingTransfer,
  addTransfer,
  applyRepeatingTransfers,
  decodeStore,
  encodeStore,
  mergeView,
  stampChanges,
  stopRepeatingTransfer,
  storeFromView,
  upgradeV3toV4,
  viewOf,
  type Store,
} from './books';
import { changeStoreCurrency, completeStore, defaultSettings, type AppData } from './store';
import { migrate } from './migrations';

const base = (): Store => {
  const data: AppData = {
    version: 2,
    transactions: [],
    budgets: {},
    recurring: [],
    goals: [],
    settings: { ...defaultSettings(), currency: 'NGN', business: true },
  };
  let s = storeFromView(data);
  // ₦500,000 of sales in the business each of Oct and Nov.
  const biz = viewOf(s, 'business');
  s = mergeView(s, 'business', {
    ...biz,
    transactions: [
      { id: 's1', type: 'income', amount: 500_000, category: 'Sales', note: 'Sales', date: '2026-10-02' },
      { id: 's2', type: 'income', amount: 500_000, category: 'Sales', note: 'Sales', date: '2026-11-02' },
    ],
  });
  return s;
};
const pay = { from: 'business' as const, to: 'personal' as const, amount: 200_000, note: 'Pay yourself' };

describe('repeating transfers', () => {
  it('starts this month when the day is still to come, and never back-dates', () => {
    const s = addRepeatingTransfer(base(), { ...pay, day: 30 }, '2026-11-20');
    expect(s.repeatingTransfers[0].startMonth).toBe('2026-11');
    expect(s.transfers).toHaveLength(0);
    const later = addRepeatingTransfer(base(), { ...pay, day: 5 }, '2026-11-20');
    expect(later.repeatingTransfers[0].startMonth).toBe('2026-12');
    expect(later.transfers).toHaveLength(0);
  });

  it('makes today’s one straight away when the day is today', () => {
    const s = addRepeatingTransfer(base(), { ...pay, day: 20 }, '2026-11-20');
    expect(s.transfers).toMatchObject([{ date: '2026-11-20', amount: 200_000, from: 'business', to: 'personal' }]);
  });

  it('catches up each missed month once, on the month’s last day for the 31st', () => {
    let s = addRepeatingTransfer(base(), { ...pay, day: 31 }, '2026-11-20');
    s = applyRepeatingTransfers(s, '2027-02-28');
    expect(s.transfers.map((t) => t.date)).toEqual(['2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28']);
    expect(applyRepeatingTransfers(s, '2027-02-28')).toBe(s);
  });

  it('skips a month the sending side can’t cover when asked to', () => {
    let s = addRepeatingTransfer(base(), { ...pay, amount: 400_000, day: 25, onlyIfSafe: true }, '2026-11-20');
    s = applyRepeatingTransfers(s, '2026-12-26');
    // November: ₦500k in → covered. December: no sales → skipped.
    expect(s.transfers.map((t) => t.date)).toEqual(['2026-11-25']);
    expect(s.repeatingTransfers[0].skipped).toEqual(['2026-12']);
  });

  it('stopping keeps the transfers already made', () => {
    let s = addRepeatingTransfer(base(), { ...pay, day: 20 }, '2026-11-20');
    s = stopRepeatingTransfer(s, s.repeatingTransfers[0].id);
    expect(s.repeatingTransfers).toHaveLength(0);
    expect(s.transfers).toHaveLength(1);
    expect(applyRepeatingTransfers(s, '2027-03-01').transfers).toHaveLength(1);
  });

  it('a paused one makes nothing', () => {
    let s = addRepeatingTransfer(base(), { ...pay, day: 25 }, '2026-11-20');
    s = { ...s, repeatingTransfers: [{ ...s.repeatingTransfers[0], paused: true }] };
    expect(applyRepeatingTransfers(s, '2027-01-30').transfers).toHaveLength(0);
  });

  it('is saved and read back exactly', () => {
    const s = addRepeatingTransfer(base(), { ...pay, amount: 200_000.5, day: 20 }, '2026-11-20');
    const back = completeStore(JSON.parse(JSON.stringify(encodeStore(s))));
    expect(back?.repeatingTransfers).toEqual(s.repeatingTransfers);
    expect(back?.transfers).toEqual(s.transfers);
  });
});

describe('change times and deletion markers', () => {
  const now = '2026-11-20T10:00:00.000Z';
  it('stamps new and changed records, leaves unchanged ones alone', () => {
    const before = base();
    const after = stampChanges(before, addTransfer(before, { ...pay, date: '2026-11-20' }), now);
    expect(after.transfers[0].updatedAt).toBe(now);
    const biz = after.books.business.transactions;
    expect(biz.every((t) => t.updatedAt === undefined)).toBe(true);
    const edited = mergeView(after, 'business', { ...viewOf(after, 'business'), transactions: biz.map((t) => (t.id === 's1' ? { ...t, amount: 1 } : t)) });
    const later = stampChanges(after, edited, '2026-11-21T00:00:00.000Z');
    expect(later.books.business.transactions.find((t) => t.id === 's1')?.updatedAt).toBe('2026-11-21T00:00:00.000Z');
    expect(later.books.business.transactions.find((t) => t.id === 's2')?.updatedAt).toBeUndefined();
    expect(later.transfers[0].updatedAt).toBe(now);
  });

  it('leaves a marker for deletions, but not for records moved elsewhere', () => {
    const s = base();
    const deleted = mergeView(s, 'business', { ...viewOf(s, 'business'), transactions: viewOf(s, 'business').transactions.slice(1) });
    expect(stampChanges(s, deleted, now).tombstones).toEqual([{ id: 's1', at: now }]);
    const tx = viewOf(s, 'business').transactions[0];
    const moved = mergeView(deleted, 'personal', { ...viewOf(deleted, 'personal'), transactions: [tx] });
    expect(stampChanges(s, moved, now).tombstones).toEqual([]);
  });

  it('nothing changed means nothing stamped', () => {
    const s = base();
    expect(stampChanges(s, s, now)).toBe(s);
  });
});

describe('format 4', () => {
  it('upgrades v3 data with nothing else changed', () => {
    const v3: Record<string, unknown> = { ...(encodeStore(base()) as Record<string, unknown>), version: 3 };
    delete v3.repeatingTransfers;
    delete v3.tombstones;
    delete v3.rateLog;
    const r = migrate(v3);
    expect(r.ok).toBe(true);
    const s = r.ok ? completeStore(r.data) : null;
    expect(s?.books).toEqual(base().books);
    expect(s).toMatchObject({ version: 4, repeatingTransfers: [], tombstones: [], rateLog: [] });
    expect(upgradeV3toV4(v3)).toMatchObject({ version: 4 });
  });

  it('refuses data that isn’t version 4', () => {
    expect(decodeStore({ ...(encodeStore(base()) as Record<string, unknown>), version: 3 })).toBeNull();
  });

  it('records each change of base currency and the rate used', () => {
    let s = addRepeatingTransfer(base(), { ...pay, day: 25 }, '2026-11-20');
    s = changeStoreCurrency(s, 'USD', 'convert', 1 / 1500);
    expect(s.rateLog).toMatchObject([{ from: 'NGN', to: 'USD', rate: 1 / 1500, mode: 'convert' }]);
    expect(s.repeatingTransfers[0].amount).toBeCloseTo(133.33, 2);
    s = changeStoreCurrency(s, 'GHS', 'relabel');
    expect(s.rateLog[1]).toMatchObject({ from: 'USD', to: 'GHS', rate: 1, mode: 'relabel' });
  });
});
