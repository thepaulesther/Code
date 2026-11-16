import { CURRENT_VERSION, migrate, versionOf } from './migrations';
import { completeData, type AppData } from './store';

/**
 * Full backups: every financial record and setting Elora keeps, in one JSON file.
 * Unlike the CSV export (transactions only), restoring a backup brings back budgets, goals,
 * repeating items, categories and settings too.
 */

export const BACKUP_FORMAT = 'elora-backup';
export const BACKUP_FORMAT_VERSION = 1;

export interface BackupCounts {
  transactions: number;
  repeating: number;
  budgets: number;
  goals: number;
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  dataVersion: number;
  app: 'Elora';
  exportedAt: string;
  counts: BackupCounts;
  /** SHA-256 of `data` as written. Detects a damaged or edited file; it is not a security measure. */
  checksum: string | null;
  data: AppData;
}

export const countsOf = (d: AppData): BackupCounts => ({
  transactions: d.transactions.length,
  repeating: d.recurring.length,
  budgets: Object.keys(d.budgets).length,
  goals: (d.goals ?? []).length,
});

/** Hex SHA-256 of `text`, or null where the browser can't compute it (e.g. a non-HTTPS page). */
export async function sha256(text: string): Promise<string | null> {
  try {
    const bytes = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

export async function createBackup(data: AppData, now = new Date()): Promise<string> {
  const file: BackupFile = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    dataVersion: data.version,
    app: 'Elora',
    exportedAt: now.toISOString(),
    counts: countsOf(data),
    checksum: await sha256(JSON.stringify(data)),
    data,
  };
  return JSON.stringify(file, null, 2);
}

/* ---------- Validation ---------- */

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isAmount = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const isDate = (v: unknown) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
const isMonth = (v: unknown) => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

/**
 * Strict checks for data coming from a file, record by record. (Data already saved in this browser
 * is checked more leniently on load, so an existing user is never locked out by a stricter rule.)
 * Returns readable problems; an empty list means the data is fine.
 */
export function validateAppData(d: unknown): string[] {
  const problems: string[] = [];
  const add = (p: string) => problems.length < 50 && problems.push(p);
  if (!isObj(d)) return ['The file doesn’t contain Elora data.'];

  const txs = d.transactions;
  if (!Array.isArray(txs)) add('Transactions are missing.');
  else {
    const ids = new Set<string>();
    txs.forEach((t, i) => {
      const n = `Transaction ${i + 1}`;
      if (!isObj(t)) return add(`${n} isn’t a record.`);
      if (typeof t.id !== 'string' || !t.id) add(`${n} has no id.`);
      else if (ids.has(t.id)) add(`${n} repeats the id “${t.id}”.`);
      else ids.add(t.id);
      if (t.type !== 'income' && t.type !== 'expense') add(`${n} is neither income nor an expense.`);
      if (!isAmount(t.amount)) add(`${n} has an amount that isn’t a number of 0 or more.`);
      if (!isDate(t.date)) add(`${n} has a date that isn’t a real YYYY-MM-DD date.`);
      if (typeof t.category !== 'string') add(`${n} has no category.`);
      if (t.note != null && typeof t.note !== 'string') add(`${n} has a note that isn’t text.`);
      if (t.spread != null && !(Number.isInteger(t.spread) && (t.spread as number) >= 2 && (t.spread as number) <= 120))
        add(`${n} is spread over an invalid number of months.`);
      if (t.original != null) {
        const o = t.original;
        if (!isObj(o) || !isAmount(o.amount) || typeof o.currency !== 'string' || !(typeof o.rate === 'number' && o.rate > 0 && Number.isFinite(o.rate)))
          add(`${n} has an invalid original amount or exchange rate.`);
      }
    });
  }

  if (!isObj(d.budgets)) add('Budgets are missing.');
  else for (const [c, v] of Object.entries(d.budgets)) if (!isAmount(v)) add(`The budget for “${c}” isn’t a number of 0 or more.`);

  if (!Array.isArray(d.recurring)) add('Repeating items are missing.');
  else {
    const ids = new Set<string>();
    d.recurring.forEach((r, i) => {
      const n = `Repeating item ${i + 1}`;
      if (!isObj(r)) return add(`${n} isn’t a record.`);
      if (typeof r.id !== 'string' || !r.id || ids.has(r.id)) add(`${n} has a missing or repeated id.`);
      else ids.add(r.id);
      if (r.type !== 'income' && r.type !== 'expense') add(`${n} is neither income nor an expense.`);
      if (!isAmount(r.amount)) add(`${n} has an invalid amount.`);
      if (!(Number.isInteger(r.day) && (r.day as number) >= 1 && (r.day as number) <= 31)) add(`${n} has an invalid day of the month.`);
      if (!isMonth(r.startMonth)) add(`${n} has an invalid start month.`);
    });
  }

  if (d.goals != null) {
    if (!Array.isArray(d.goals)) add('Goals aren’t a list.');
    else
      d.goals.forEach((g, i) => {
        const n = `Goal ${i + 1}`;
        if (!isObj(g) || typeof g.id !== 'string' || typeof g.name !== 'string') return add(`${n} is missing its id or name.`);
        if (!isAmount(g.target)) add(`${n} has an invalid target.`);
        if (!Array.isArray(g.contributions)) add(`${n} has no contribution list.`);
        else
          g.contributions.forEach((c, j) => {
            if (!isObj(c) || typeof c.amount !== 'number' || !Number.isFinite(c.amount) || !isDate(c.date))
              add(`${n}, contribution ${j + 1}, has an invalid amount or date.`);
          });
      });
  }

  const s = d.settings;
  if (!isObj(s)) add('Settings are missing.');
  else {
    if (typeof s.currency !== 'string') add('The base currency is missing.');
    if (s.theme != null && !['system', 'light', 'dark'].includes(s.theme as string)) add('The theme isn’t one Elora knows.');
  }
  return problems;
}

/* ---------- Reading a file ---------- */

export interface BackupInfo {
  /** "backup" for an Elora backup file; "saved-data" for raw saved data (a recovery download or safety copy). */
  kind: 'backup' | 'saved-data';
  exportedAt: string | null;
  counts: BackupCounts;
  currency: string;
  firstDate: string | null;
  lastDate: string | null;
  upgradedFrom: number | null;
  checksum: 'verified' | 'missing';
}

export type ParseResult =
  | { ok: true; data: AppData; info: BackupInfo }
  | { ok: false; problems: string[] };

/** Read and check a backup before anything is replaced. Never touches stored data. */
export async function parseBackup(text: string): Promise<ParseResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, problems: ['This isn’t a backup file Elora can read (it isn’t valid JSON).'] };
  }
  if (!isObj(parsed)) return { ok: false, problems: ['This file doesn’t contain Elora data.'] };

  let payload: unknown;
  let kind: BackupInfo['kind'];
  let exportedAt: string | null = null;
  let checksum: BackupInfo['checksum'] = 'missing';
  if (parsed.format === BACKUP_FORMAT) {
    kind = 'backup';
    if (typeof parsed.formatVersion !== 'number' || parsed.formatVersion > BACKUP_FORMAT_VERSION)
      return { ok: false, problems: ['This backup was made by a newer version of Elora. Update Elora, then try again.'] };
    payload = parsed.data;
    exportedAt = typeof parsed.exportedAt === 'string' ? parsed.exportedAt : null;
    if (typeof parsed.checksum === 'string') {
      const actual = await sha256(JSON.stringify(payload));
      if (actual == null) checksum = 'missing'; // can't check here; the record checks below still run
      else if (actual !== parsed.checksum)
        return { ok: false, problems: ['This backup has been changed or damaged since it was made (its checksum doesn’t match).'] };
      else checksum = 'verified';
    }
  } else if (versionOf(parsed) != null) {
    kind = 'saved-data';
    payload = parsed;
  } else {
    return { ok: false, problems: ['This file isn’t an Elora backup.'] };
  }

  const version = versionOf(payload);
  if (version != null && version > CURRENT_VERSION)
    return { ok: false, problems: ['This backup holds data from a newer version of Elora. Update Elora, then try again.'] };
  const m = migrate(payload);
  if (!m.ok) return { ok: false, problems: [m.reason] };

  const problems = validateAppData(m.data);
  if (problems.length) return { ok: false, problems };
  const data = completeData(m.data);
  if (!data) return { ok: false, problems: ['Some of the data isn’t in the shape Elora expects.'] };

  if (kind === 'backup' && isObj(parsed.counts)) {
    const c = countsOf(data);
    const said = parsed.counts as Partial<BackupCounts>;
    if (said.transactions !== c.transactions || said.repeating !== c.repeating || said.budgets !== c.budgets || said.goals !== c.goals)
      return { ok: false, problems: ['The number of records doesn’t match what the backup says it contains, so it may be incomplete.'] };
  }

  const dates = data.transactions.map((t) => t.date).sort();
  return {
    ok: true,
    data,
    info: {
      kind,
      exportedAt,
      counts: countsOf(data),
      currency: data.settings.currency,
      firstDate: dates[0] ?? null,
      lastDate: dates[dates.length - 1] ?? null,
      upgradedFrom: m.steps > 0 ? m.from : null,
      checksum,
    },
  };
}
