import { newId, round2, type Transaction, type TxType } from './budget';
import { daysInMonth } from './recurring';

/** Parse CSV text (comma, semicolon or tab separated; quoted fields; CRLF; BOM). Drops blank rows. */
export function parseCSV(text: string): string[][] {
  text = text.replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delim = [',', ';', '\t']
    .map((d) => [d, firstLine.split(d).length] as const)
    .sort((a, b) => b[1] - a[1])[0][0];

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"' && field === '') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export type DateFormat = 'mdy' | 'dmy';

/** Accepts ISO (2026-11-14) always, otherwise 11/14/2026 (mdy) or 14/11/2026 (dmy). Two-digit years are 20xx. */
export function parseDate(s: string, format: DateFormat): string | null {
  const t = s.trim();
  let y: number, mo: number, d: number;
  const iso = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  const other = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/);
  if (iso) {
    [y, mo, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (other) {
    const a = Number(other[1]);
    const b = Number(other[2]);
    y = Number(other[3]);
    if (y < 100) y += 2000;
    [mo, d] = format === 'mdy' ? [a, b] : [b, a];
  } else return null;
  if (mo < 1 || mo > 12) return null;
  const month = `${y}-${String(mo).padStart(2, '0')}`;
  if (d < 1 || d > daysInMonth(month)) return null;
  return `${month}-${String(d).padStart(2, '0')}`;
}

/** Pick mdy vs dmy by finding a value that only one reading allows. Defaults to mdy. */
export function detectDateFormat(values: string[]): DateFormat {
  for (const v of values) {
    const m = v.trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/);
    if (!m) continue;
    if (Number(m[1]) > 12) return 'dmy';
    if (Number(m[2]) > 12) return 'mdy';
  }
  return 'mdy';
}

/** "-1,234.56", "(12.00)", "$5", "1.234,56", "12.50-" -> signed number, or null. */
export function parseSignedAmount(s: string): number | null {
  let t = s.trim().replace(/[−–]/g, '-');
  if (!t) return null;
  const negative = /^\(.*\)$/.test(t) || t.includes('-');
  t = t.replace(/[^\d.,]/g, '');
  if (!/\d/.test(t)) return null;
  const lastDot = t.lastIndexOf('.');
  const lastComma = t.lastIndexOf(',');
  if (lastDot !== -1 && lastComma !== -1) {
    // Whichever separator comes last is the decimal point.
    t = lastComma > lastDot ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (lastComma !== -1) {
    t = /,\d{1,2}$/.test(t) && t.indexOf(',') === lastComma ? t.replace(',', '.') : t.replace(/,/g, '');
  }
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n * 100) / 100;
  return negative ? -rounded : rounded;
}

/** Column index for each field, or -1 when the file has no such column. */
export interface ColumnMap {
  date: number;
  amount: number;
  debit: number;
  credit: number;
  note: number;
  category: number;
  type: number;
  /** Ledgerly's own export: what a converted amount was originally, and the rate used. */
  origAmount: number;
  origCurrency: number;
  rate: number;
  spread: number;
}

export const EMPTY_MAP: ColumnMap = {
  date: -1, amount: -1, debit: -1, credit: -1, note: -1, category: -1, type: -1, origAmount: -1, origCurrency: -1, rate: -1, spread: -1,
};

/** Guess columns from a header row. `date === -1` means it doesn't look like a header. */
export function guessMapping(header: string[]): ColumnMap {
  const h = header.map((x) => x.trim().toLowerCase());
  const used = new Set<number>();
  const find = (re: RegExp) => {
    const i = h.findIndex((x, idx) => !used.has(idx) && re.test(x));
    if (i !== -1) used.add(i);
    return i;
  };
  const map = { ...EMPTY_MAP };
  // Specific columns first, so "original_amount" isn't taken as the amount.
  map.origAmount = find(/^original[ _]amount$/);
  map.origCurrency = find(/^original[ _]currency$/);
  map.rate = find(/^(exchange[ _])?rate$/);
  map.spread = find(/^spread[ _]months$/);
  map.date = find(/date/);
  map.type = find(/^type$|transaction type|^kind$|debit\s*\/\s*credit|credit\s*\/\s*debit|^dr\/cr$|^cr\/dr$/);
  map.category = find(/categor/);
  map.amount = find(/amount|^value$|^sum$/);
  if (map.amount === -1) {
    map.debit = find(/debit|withdraw|money out|paid out|spent/);
    map.credit = find(/credit|deposit|money in|paid in|received/);
  }
  map.note = find(/desc|memo|note|payee|merchant|narrative|details|^name$|reference|particulars/);
  return map;
}

/** For files without a header: find the date column, the amount column and the longest text column. */
export function guessMappingFromData(rows: string[][]): ColumnMap {
  const sample = rows.slice(0, 20);
  const cols = Math.max(0, ...sample.map((r) => r.length));
  const map = { ...EMPTY_MAP };
  const share = (col: number, ok: (v: string) => boolean) =>
    sample.filter((r) => ok(r[col] ?? '')).length / Math.max(sample.length, 1);
  for (let c = 0; c < cols; c++) {
    if (map.date === -1 && share(c, (v) => parseDate(v, 'mdy') != null || parseDate(v, 'dmy') != null) > 0.8) map.date = c;
  }
  for (let c = 0; c < cols; c++) {
    if (c !== map.date && map.amount === -1 && share(c, (v) => /\d/.test(v) && parseSignedAmount(v) != null && !/[a-z]{2,}/i.test(v)) > 0.8)
      map.amount = c;
  }
  let best = -1;
  let bestLen = 0;
  for (let c = 0; c < cols; c++) {
    if (c === map.date || c === map.amount) continue;
    const len = sample.reduce((s, r) => s + (r[c]?.length ?? 0), 0);
    if (len > bestLen) [best, bestLen] = [c, len];
  }
  map.note = best;
  return map;
}

export const fallbackCategory = (list: string[], type: TxType) => {
  const preferred = type === 'expense' ? 'Other' : 'Other income';
  return list.includes(preferred) ? preferred : (list[list.length - 1] ?? preferred);
};

export interface ImportOptions {
  map: ColumnMap;
  dateFormat: DateFormat;
  /** For a single signed amount column: what a positive number means. */
  positiveIs: TxType;
  expenseCategories: string[];
  incomeCategories: string[];
  existing: Transaction[];
  /** The app's base currency. */
  base: string;
  /** Currency the file's amounts are in (e.g. a USD account statement). Defaults to `base`. */
  fileCurrency?: string;
  /** Base units per 1 `fileCurrency`; required when it differs from `base`. */
  rate?: number;
}

export interface ImportRow {
  line: number; // 1-based line in the data (after the header)
  tx?: Transaction;
  status: 'new' | 'duplicate' | 'invalid';
  reason?: string;
}

/** Converted amounts compare by their original currency amount, so a re-import at a new rate still matches. */
const dupKey = (t: Pick<Transaction, 'date' | 'type' | 'amount' | 'note' | 'original'>) =>
  `${t.date}|${t.type}|${t.original ? t.original.currency + t.original.amount.toFixed(2) : t.amount.toFixed(2)}|${t.note.trim().toLowerCase()}`;

export function buildImport(rows: string[][], o: ImportOptions): ImportRow[] {
  const seen = new Set(o.existing.map(dupKey));
  const { map } = o;
  return rows.map((r, i): ImportRow => {
    const line = i + 1;
    const cell = (idx: number) => (idx >= 0 ? (r[idx] ?? '').trim() : '');

    const date = parseDate(cell(map.date), o.dateFormat);
    if (!date) return { line, status: 'invalid', reason: 'Unreadable date' };

    let signed: number | null = null;
    if (map.amount >= 0) {
      signed = parseSignedAmount(cell(map.amount));
    } else {
      const debit = parseSignedAmount(cell(map.debit));
      const credit = parseSignedAmount(cell(map.credit));
      if (debit) signed = -Math.abs(debit);
      else if (credit) signed = Math.abs(credit);
    }
    if (!signed) return { line, status: 'invalid', reason: 'No amount' };

    const typeCell = cell(map.type);
    let type: TxType;
    if (/income|credit|deposit|^cr$|^in$/i.test(typeCell)) type = 'income';
    else if (/expense|debit|withdraw|payment|purchase|^dr$|^out$/i.test(typeCell)) type = 'expense';
    else if (map.amount < 0) type = signed < 0 ? 'expense' : 'income';
    else type = signed > 0 === (o.positiveIs === 'income') ? 'income' : 'expense';

    const list = type === 'expense' ? o.expenseCategories : o.incomeCategories;
    const rawCat = cell(map.category).toLowerCase();
    const category = list.find((c) => c.toLowerCase() === rawCat) ?? fallbackCategory(list, type);

    let amount = Math.abs(signed);
    let original: Transaction['original'];
    const rowCurrency = cell(map.origCurrency).toUpperCase();
    const rowOriginal = parseSignedAmount(cell(map.origAmount));
    const rowRate = Number(cell(map.rate).replace(/,/g, ''));
    const fileCurrency = (o.fileCurrency ?? o.base).toUpperCase();
    if (/^[A-Z]{3}$/.test(rowCurrency) && rowCurrency !== o.base && rowOriginal && rowRate > 0) {
      // Our own export: the amount column is already in base; keep what it was originally.
      original = { amount: Math.abs(rowOriginal), currency: rowCurrency, rate: rowRate };
    } else if (fileCurrency !== o.base) {
      const rate = o.rate ?? 0;
      if (!(rate > 0)) return { line, status: 'invalid', reason: 'No exchange rate' };
      original = { amount, currency: fileCurrency, rate };
      amount = round2(amount * rate);
    }

    const tx: Transaction = {
      id: newId(),
      type,
      amount,
      category,
      note: cell(map.note).slice(0, 80),
      date,
      ...(original ? { original } : {}),
    };
    const spread = Number.parseInt(cell(map.spread), 10);
    if (spread > 1 && spread <= 120) tx.spread = spread;
    return { line, tx, status: seen.has(dupKey(tx)) ? 'duplicate' : 'new' };
  });
}
