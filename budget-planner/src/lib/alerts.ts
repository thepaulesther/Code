import type { TxType } from './budget';

/**
 * Reading pasted bank and POS alerts (SMS or email), e.g.
 *   "Credit Alert! Acct: 01******89 Amt: NGN45,000.00 Desc: TRF FROM CHIDI OKAFOR Date: 17-11-2026 10:15 Bal: NGN312,400.00"
 * Everything happens on the device; nothing is sent anywhere. A message that doesn't clearly say how much
 * and whether money came in or went out is skipped rather than guessed.
 */

export type PayMethod = 'cash' | 'transfer' | 'pos';

export interface ParsedAlert {
  type: TxType;
  amount: number;
  /** YYYY-MM-DD when the alert says, otherwise null (use today). */
  date: string | null;
  /** Who paid or was paid, or the alert's description. */
  note: string;
  method: PayMethod | null;
  /** The text this came from, to show the person what was read. */
  source: string;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Split pasted text into one chunk per alert: by blank lines, or where a new "Credit/Debit Alert" starts. */
export function splitAlerts(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n|(?=\b(?:credit|debit)\s+alert\b)/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const AMOUNT = String.raw`(?:NGN|N|₦)\s?([0-9][0-9,]*(?:\.[0-9]{1,2})?)`;

function toNumber(s: string): number | null {
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function findAmount(t: string): number | null {
  // 1. A labelled amount: "Amt: NGN45,000.00", "Amount: 45,000", "Amount NGN 45,000".
  const labelled = /\b(?:amt|amount)\b[^0-9₦N]{0,6}(?:NGN|N|₦)?\s?([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i.exec(t);
  if (labelled) return toNumber(labelled[1]);
  // 2. The first naira amount that isn't the balance.
  const re = new RegExp(AMOUNT, 'gi');
  for (let m = re.exec(t); m; m = re.exec(t)) {
    const before = t.slice(Math.max(0, m.index - 12), m.index).toLowerCase();
    if (/(bal|balance|avail|ledger)[^a-z]*$/.test(before)) continue;
    return toNumber(m[1]);
  }
  return null;
}

function findType(t: string): TxType | null {
  // The alert's own heading decides first ("Credit Alert", "DR", "Debit transaction").
  const head = /\b(credit|debit)\s+(alert|transaction|notification)\b|^\s*\[?(cr|dr)\b/i.exec(t);
  if (head) return /^c/i.test(head[1] ?? head[3]) ? 'income' : 'expense';
  const s = t.toLowerCase();
  const credit = /\bcredit(ed)?\b|\bcr\b|\breceived\b|\bdeposit|\binflow\b|\btrf from\b|\btransfer from\b/.test(s);
  const debit = /\bdebit(ed)?\b|\bdr\b|\bwithdraw|\bpurchase\b|\bpaid to\b|\btrf to\b|\btransfer to\b|\boutflow\b/.test(s);
  if (credit && !debit) return 'income';
  if (debit && !credit) return 'expense';
  return null;
}

const pad = (n: number) => String(n).padStart(2, '0');

function validDate(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
}

/** Nigerian alerts write the day first: 17-11-2026, 17/11/26, 17-Nov-2026, and sometimes 2026-11-17. */
function findDate(t: string): string | null {
  let m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(t);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  m = /\b(\d{1,2})[-/ ]([A-Za-z]{3})[A-Za-z]*[-/ ,]+(\d{2,4})\b/.exec(t);
  if (m) {
    const month = MONTHS.indexOf(m[2].toLowerCase()) + 1;
    const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    if (month) return validDate(year, month, +m[1]);
  }
  m = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/.exec(t);
  if (m) return validDate(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  return null;
}

function findMethod(t: string): PayMethod | null {
  if (/\bpos\b/i.test(t)) return 'pos';
  if (/\b(trf|transfer|nip|nibss|ussd)\b/i.test(t)) return 'transfer';
  if (/\bcash\b/i.test(t)) return 'cash';
  return null;
}

const tidy = (s: string) =>
  s
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .slice(0, 60);

function findNote(t: string, type: TxType): string {
  const stop = String.raw`(?=\s+(?:on|date|time|bal(?:ance)?|avail|acct|ref|amt|amount)\b|[.,;\n]|$)`;
  const desc = new RegExp(String.raw`\b(?:desc(?:ription)?|narration|remarks?|details?)\s*[:-]\s*(.+?)` + stop, 'i').exec(t);
  const from = new RegExp(String.raw`\b(?:from|sender)\s*[:-]?\s*([A-Za-z][A-Za-z .'&-]{2,40}?)` + stop, 'i').exec(t);
  const to = new RegExp(String.raw`\b(?:to|beneficiary|merchant)\s*[:-]?\s*([A-Za-z][A-Za-z .'&-]{2,40}?)` + stop, 'i').exec(t);
  let note = desc?.[1] ?? (type === 'income' ? from?.[1] : to?.[1]) ?? '';
  note = note.replace(/\/.*$/, '').replace(/^(?:(?:trf|transfer|nip|pos)\s*)+(?:from|to)?\s*/i, '');
  return tidy(note) || (type === 'income' ? 'Money received' : 'Payment');
}

export function parseAlert(text: string): ParsedAlert | null {
  const amount = findAmount(text);
  const type = findType(text);
  if (!amount || !type) return null;
  return { type, amount, date: findDate(text), note: findNote(text, type), method: findMethod(text), source: text.trim() };
}

/** Every alert that could be read, and how many pieces of text couldn't. */
export function parseAlerts(text: string): { alerts: ParsedAlert[]; skipped: number } {
  const chunks = splitAlerts(text);
  const alerts = chunks.map(parseAlert).filter((a): a is ParsedAlert => a != null);
  return { alerts, skipped: chunks.length - alerts.length };
}

export const METHOD_LABEL: Record<PayMethod, string> = { cash: 'Cash', transfer: 'Transfer', pos: 'POS' };
