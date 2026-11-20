import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CURRENT_VERSION, migrate, versionOf, type Migration } from './migrations';
import { listSnapshots, openStore, quarantine, takeSnapshot } from './store';

/** In-memory localStorage, optionally refusing writes (to act like a full browser storage). */
function fakeStorage() {
  const map = new Map<string, string>();
  let full = false;
  const store = {
    get length() { return map.size; },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      if (full) throw new DOMException('Quota exceeded', 'QuotaExceededError');
      map.set(k, String(v));
    },
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
  // Object.keys(localStorage) must list the stored keys, as in a browser.
  const proxy = new Proxy(store, {
    ownKeys: () => [...map.keys()],
    getOwnPropertyDescriptor: (_t, k) => (map.has(String(k)) ? { enumerable: true, configurable: true, value: map.get(String(k)) } : undefined),
  });
  return { storage: proxy as unknown as Storage, map, setFull: (v: boolean) => { full = v; } };
}

let fake: ReturnType<typeof fakeStorage>;
beforeEach(() => {
  fake = fakeStorage();
  Object.defineProperty(globalThis, 'localStorage', { value: fake.storage, configurable: true });
});
afterEach(() => {
  Reflect.deleteProperty(globalThis, 'localStorage');
});

const v2 = {
  version: 2,
  transactions: [{ id: 't1', type: 'expense', amount: 12.5, category: 'Groceries', note: 'Shop', date: '2026-11-03' }],
  budgets: { Groceries: 400 },
  recurring: [],
  goals: [],
  settings: { currency: 'NGN', theme: 'system', expenseCategories: ['Groceries'], incomeCategories: ['Salary'] },
};

describe('migrate', () => {
  it('reads the version', () => {
    expect(versionOf({ version: 2 })).toBe(2);
    expect(versionOf({ version: '2' })).toBeNull();
    expect(versionOf(null)).toBeNull();
  });

  it('upgrades version 1 to the current version without changing its input', () => {
    const v1 = { version: 1, transactions: v2.transactions, budgets: { Groceries: 300 } };
    const before = JSON.stringify(v1);
    const r = migrate(v1);
    expect(r).toMatchObject({ ok: true, from: 1, steps: 2, data: { version: CURRENT_VERSION, books: { personal: { budgets: { Groceries: 30_000 }, recurring: [] } } } });
    expect(JSON.stringify(v1)).toBe(before);
  });

  it('leaves current data as it is', () => {
    const v3 = migrate(v2);
    if (!v3.ok) throw new Error(v3.reason);
    expect(migrate(v3.data)).toMatchObject({ ok: true, steps: 0, data: v3.data });
  });

  it('refuses data from a newer version, or with no version', () => {
    expect(migrate({ version: CURRENT_VERSION + 1 })).toMatchObject({ ok: false });
    expect(migrate({ transactions: [] })).toMatchObject({ ok: false });
  });

  it('stops when a step is missing, throws or returns the wrong version', () => {
    const throwing: Migration[] = [{ from: 1, to: 2, describe: '', run: () => { throw new Error('boom'); } }];
    const wrong: Migration[] = [{ from: 1, to: 2, describe: '', run: () => ({ version: 7 }) }];
    expect(migrate({ version: 1 }, [])).toMatchObject({ ok: false });
    expect(migrate({ version: 1 }, throwing)).toMatchObject({ ok: false, reason: expect.stringContaining('boom') });
    expect(migrate({ version: 1 }, wrong)).toMatchObject({ ok: false });
  });
});

describe('openStore', () => {
  it('starts empty on a first visit and writes nothing', () => {
    expect(openStore().status).toBe('empty');
    expect(fake.map.size).toBe(0);
  });

  it('opens current data, filling in missing settings', () => {
    const m = migrate(v2);
    if (!m.ok) throw new Error(m.reason);
    const saved = structuredClone(m.data) as { books: { personal: Record<string, unknown> } };
    delete saved.books.personal.expenseCategories;
    fake.map.set('bp.data', JSON.stringify(saved));
    const s = openStore();
    expect(s.status).toBe('ok');
    if (s.status === 'ok') expect(s.data.books.personal.expenseCategories.length).toBeGreaterThan(0);
  });

  it('never overwrites data saved by a newer version', () => {
    const raw = JSON.stringify({ ...v2, version: CURRENT_VERSION + 1 });
    fake.map.set('bp.data', raw);
    expect(openStore()).toMatchObject({ status: 'newer', version: CURRENT_VERSION + 1, raw });
    expect(fake.map.get('bp.data')).toBe(raw);
  });

  it('never overwrites data it can’t read', () => {
    for (const raw of ['{"version":2,"transactions":[', '{"transactions":[]}', JSON.stringify({ ...v2, budgets: { Groceries: 'lots' } })]) {
      fake.map.clear();
      fake.map.set('bp.data', raw);
      expect(openStore()).toMatchObject({ status: 'unreadable', raw });
      expect(fake.map.get('bp.data')).toBe(raw);
    }
  });

  it('upgrades the original two-key format, keeping a verified safety copy first', () => {
    fake.map.set('bp.transactions', JSON.stringify(v2.transactions));
    fake.map.set('bp.budgets', JSON.stringify({ Groceries: 300 }));
    const s = openStore();
    expect(s.status).toBe('migrated');
    if (s.status !== 'migrated') return;
    expect(s.from).toBe(1);
    expect(s.data.settings.currency).toBe('USD');
    expect(s.data.books.personal.transactions).toHaveLength(1);
    expect(JSON.parse(fake.map.get(s.snapshotKey)!)).toMatchObject({ version: 1, budgets: { Groceries: 300 } });
    // The old keys are left alone.
    expect(fake.map.has('bp.transactions')).toBe(true);
  });

  it('doesn’t upgrade when the safety copy can’t be saved', () => {
    fake.map.set('bp.transactions', JSON.stringify(v2.transactions));
    fake.setFull(true);
    expect(openStore()).toMatchObject({ status: 'unreadable', reason: expect.stringContaining('safety copy') });
  });
});

describe('safety copies', () => {
  it('keeps the newest three', () => {
    for (let i = 0; i < 5; i++) takeSnapshot('restore', `copy ${i}`, new Date(Date.UTC(2026, 10, 14, 10, i)));
    const list = listSnapshots();
    expect(list.map((s) => fake.map.get(s.key))).toEqual(['copy 4', 'copy 3', 'copy 2']);
    expect(list[0]).toMatchObject({ reason: 'restore', bytes: 6 });
  });

  it('reports failure instead of pretending', () => {
    fake.setFull(true);
    expect(takeSnapshot('restore', 'x')).toBeNull();
    expect(quarantine('x')).toBe(false);
  });
});
