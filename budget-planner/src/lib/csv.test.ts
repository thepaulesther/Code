import { describe, expect, it } from 'vitest';
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES, toCSV, type Transaction } from './budget';
import {
  buildImport,
  detectDateFormat,
  guessMapping,
  guessMappingFromData,
  parseCSV,
  parseDate,
  parseSignedAmount,
  type ImportOptions,
} from './csv';

describe('parseCSV', () => {
  it('handles quotes, escaped quotes, CRLF, BOM and blank lines', () => {
    const text = '﻿date,note,amount\r\n2026-11-01,"Lunch, ""fancy""",12.50\r\n\r\n2026-11-02,"two\nlines",3\n';
    expect(parseCSV(text)).toEqual([
      ['date', 'note', 'amount'],
      ['2026-11-01', 'Lunch, "fancy"', '12.50'],
      ['2026-11-02', 'two\nlines', '3'],
    ]);
  });
  it('detects semicolon and tab delimiters', () => {
    expect(parseCSV('Datum;Betrag\n14.11.2026;-12,50')).toEqual([['Datum', 'Betrag'], ['14.11.2026', '-12,50']]);
    expect(parseCSV('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('parseDate', () => {
  it('reads ISO dates regardless of format', () => {
    expect(parseDate('2026-11-04', 'dmy')).toBe('2026-11-04');
    expect(parseDate('2026/1/9 10:30', 'mdy')).toBe('2026-01-09');
  });
  it('reads US and day-first dates, including 2-digit years', () => {
    expect(parseDate('11/04/2026', 'mdy')).toBe('2026-11-04');
    expect(parseDate('11/04/2026', 'dmy')).toBe('2026-04-11');
    expect(parseDate('14.11.26', 'dmy')).toBe('2026-11-14');
  });
  it('rejects impossible dates and junk', () => {
    expect(parseDate('13/14/2026', 'mdy')).toBeNull();
    expect(parseDate('02/30/2026', 'mdy')).toBeNull();
    expect(parseDate('yesterday', 'mdy')).toBeNull();
  });
});

describe('detectDateFormat', () => {
  it('finds the unambiguous value', () => {
    expect(detectDateFormat(['01/02/2026', '25/02/2026'])).toBe('dmy');
    expect(detectDateFormat(['01/02/2026', '02/25/2026'])).toBe('mdy');
    expect(detectDateFormat(['01/02/2026'])).toBe('mdy');
  });
});

describe('parseSignedAmount', () => {
  it.each([
    ['12.50', 12.5],
    ['-12.50', -12.5],
    ['$1,234.56', 1234.56],
    ['(45.00)', -45],
    ['12.50-', -12.5],
    ['−7', -7],
    ['1.234,56', 1234.56],
    ['-12,5', -12.5],
    ['1,234', 1234],
    ['€ 3', 3],
    ['', null],
    ['n/a', null],
  ])('%s -> %s', (s, n) => expect(parseSignedAmount(s)).toBe(n));
});

describe('guessMapping', () => {
  it('maps a typical bank export with one signed amount', () => {
    expect(guessMapping(['Transaction Date', 'Description', 'Amount', 'Balance'])).toMatchObject({
      date: 0, note: 1, amount: 2, debit: -1, credit: -1, category: -1, type: -1,
    });
  });
  it('maps separate debit and credit columns', () => {
    expect(guessMapping(['Date', 'Payee', 'Money Out', 'Money In'])).toMatchObject({ date: 0, note: 1, debit: 2, credit: 3, amount: -1 });
  });
  it('maps our own export', () => {
    expect(guessMapping(['date', 'type', 'category', 'amount', 'note', 'original_amount', 'original_currency', 'rate'])).toEqual({
      date: 0, type: 1, category: 2, amount: 3, note: 4, debit: -1, credit: -1, origAmount: 5, origCurrency: 6, rate: 7,
    });
  });
  it('treats a Debit/Credit column as the type when there is an amount', () => {
    expect(guessMapping(['Date', 'Debit/Credit', 'Amount', 'Memo'])).toMatchObject({ type: 1, amount: 2, debit: -1, note: 3 });
  });
  it('says "not a header" when no date column is named', () => {
    expect(guessMapping(['2026-11-01', 'Coffee', '-3.50']).date).toBe(-1);
  });
});

describe('guessMappingFromData', () => {
  it('finds date, amount and the longest text column', () => {
    const rows = [
      ['2026-11-01', 'POS', 'Corner coffee shop', '-3.50'],
      ['2026-11-02', 'POS', 'Grocery market downtown', '-54.20'],
    ];
    expect(guessMappingFromData(rows)).toMatchObject({ date: 0, amount: 3, note: 2 });
  });
});

describe('buildImport', () => {
  const base: Omit<ImportOptions, 'map'> = {
    dateFormat: 'mdy',
    positiveIs: 'income',
    expenseCategories: DEFAULT_EXPENSE_CATEGORIES,
    incomeCategories: DEFAULT_INCOME_CATEGORIES,
    existing: [],
    base: 'USD',
  };

  it('uses the sign of a single amount column', () => {
    const rows = [['11/01/2026', 'Paycheck', '4200'], ['11/03/2026', 'Coffee', '-3.50']];
    const map = { ...guessMapping(['Date', 'Description', 'Amount']) };
    const out = buildImport(rows, { ...base, map });
    expect(out.map((r) => [r.status, r.tx?.type, r.tx?.amount, r.tx?.category])).toEqual([
      ['new', 'income', 4200, 'Other income'],
      ['new', 'expense', 3.5, 'Other'],
    ]);
  });

  it('can treat positive amounts as spending (credit card statements)', () => {
    const map = guessMapping(['Date', 'Description', 'Amount']);
    const out = buildImport([['11/03/2026', 'Coffee', '3.50'], ['11/05/2026', 'Payment', '-100']], { ...base, map, positiveIs: 'expense' });
    expect(out.map((r) => r.tx?.type)).toEqual(['expense', 'income']);
  });

  it('reads debit/credit columns', () => {
    const map = guessMapping(['Date', 'Payee', 'Money Out', 'Money In']);
    const out = buildImport([['2026-11-03', 'Shop', '20.00', ''], ['2026-11-04', 'Refund', '', '5.00']], { ...base, map });
    expect(out.map((r) => [r.tx?.type, r.tx?.amount])).toEqual([['expense', 20], ['income', 5]]);
  });

  it('flags unreadable rows and duplicates of existing transactions', () => {
    const existing: Transaction[] = [{ id: 'x', type: 'expense', amount: 3.5, category: 'Dining', note: 'Coffee', date: '2026-11-03' }];
    const map = guessMapping(['Date', 'Description', 'Amount']);
    const out = buildImport(
      [['11/03/2026', 'coffee', '-3.50'], ['not a date', 'x', '1'], ['11/04/2026', 'Nothing', '']],
      { ...base, map, existing },
    );
    expect(out.map((r) => [r.status, r.reason])).toEqual([
      ['duplicate', undefined],
      ['invalid', 'Unreadable date'],
      ['invalid', 'No amount'],
    ]);
  });

  it('round-trips our own CSV export, keeping types and categories', () => {
    const txs: Transaction[] = [
      { id: '1', type: 'expense', amount: 12.5, category: 'Dining', note: 'Lunch, "fancy"', date: '2026-11-05' },
      { id: '2', type: 'income', amount: 4200, category: 'Salary', note: 'Paycheck', date: '2026-11-01' },
    ];
    const [header, ...rows] = parseCSV(toCSV(txs));
    const out = buildImport(rows, { ...base, map: guessMapping(header) });
    expect(out.map((r) => [r.tx?.date, r.tx?.type, r.tx?.category, r.tx?.amount, r.tx?.note])).toEqual([
      ['2026-11-01', 'income', 'Salary', 4200, 'Paycheck'],
      ['2026-11-05', 'expense', 'Dining', 12.5, 'Lunch, "fancy"'],
    ]);
    // Importing the same file again finds only duplicates.
    const again = buildImport(rows, { ...base, map: guessMapping(header), existing: txs });
    expect(again.every((r) => r.status === 'duplicate')).toBe(true);
  });

  it('converts a statement in another currency into the base currency', () => {
    const map = guessMapping(['Date', 'Description', 'Amount']);
    const out = buildImport([['2026-11-01', 'Client payment', '5000'], ['2026-11-02', 'Laptop', '-1,200.50']], {
      ...base,
      map,
      base: 'NGN',
      fileCurrency: 'USD',
      rate: 1520.35,
    });
    expect(out.map((r) => [r.tx?.type, r.tx?.amount, r.tx?.original])).toEqual([
      ['income', 7601750, { amount: 5000, currency: 'USD', rate: 1520.35 }],
      ['expense', 1825180.18, { amount: 1200.5, currency: 'USD', rate: 1520.35 }],
    ]);
  });

  it('marks rows unreadable when a foreign file has no rate', () => {
    const map = guessMapping(['Date', 'Description', 'Amount']);
    const out = buildImport([['2026-11-01', 'Pay', '50']], { ...base, map, base: 'NGN', fileCurrency: 'USD' });
    expect(out[0]).toMatchObject({ status: 'invalid', reason: 'No exchange rate' });
  });

  it('round-trips converted transactions, and spots duplicates by their original amount', () => {
    const txs: Transaction[] = [
      { id: '1', type: 'income', amount: 7601750, category: 'Salary', note: 'Pay', date: '2026-11-01', original: { amount: 5000, currency: 'USD', rate: 1520.35 } },
    ];
    const [header, ...rows] = parseCSV(toCSV(txs));
    const out = buildImport(rows, { ...base, base: 'NGN', map: guessMapping(header) });
    expect(out[0].tx).toMatchObject({ amount: 7601750, original: { amount: 5000, currency: 'USD', rate: 1520.35 } });
    // Same payment imported from a USD statement at a different rate is still a duplicate.
    const again = buildImport([['2026-11-01', 'Pay', '5000']], {
      ...base, base: 'NGN', fileCurrency: 'USD', rate: 1490, existing: txs, map: guessMapping(['Date', 'Description', 'Amount']),
    });
    expect(again[0].status).toBe('duplicate');
  });
});
