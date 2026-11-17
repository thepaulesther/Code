import { describe, expect, it } from 'vitest';
import { parseAlert, parseAlerts, splitAlerts } from './alerts';

// Fictional alerts in the shapes Nigerian banks and POS providers use.
const CREDIT = 'Credit Alert! Acct: 01******89 Amt: NGN45,000.00 Desc: TRF FROM CHIDI OKAFOR Date: 17-11-2026 10:15 Bal: NGN312,400.00';
const DEBIT = 'Debit Alert\nAcct: 22****1043\nAmt: NGN12,500.00\nDesc: POS PURCHASE SHOPRITE LEKKI\nDate: 16/11/2026\nAvail Bal: NGN299,900.00';
const SHORT = 'CR: N18,200 POS settlement 15-Nov-2026. Bal N1,284,000';
const PLAIN = 'You have received ₦5,000 from Amaka Bello on 14 Nov 2026 via transfer.';

describe('reading bank alerts', () => {
  it('reads a credit alert: amount, date, who paid and how', () => {
    expect(parseAlert(CREDIT)).toMatchObject({ type: 'income', amount: 45_000, date: '2026-11-17', note: 'Chidi Okafor', method: 'transfer' });
  });

  it('reads a debit alert on separate lines and ignores the balance', () => {
    expect(parseAlert(DEBIT)).toMatchObject({ type: 'expense', amount: 12_500, date: '2026-11-16', note: 'Purchase Shoprite Lekki', method: 'pos' });
  });

  it('reads short forms: CR, N without a label, month names', () => {
    expect(parseAlert(SHORT)).toMatchObject({ type: 'income', amount: 18_200, date: '2026-11-15', method: 'pos' });
    expect(parseAlert(PLAIN)).toMatchObject({ type: 'income', amount: 5_000, date: '2026-11-14', note: 'Amaka Bello', method: 'transfer' });
  });

  it('skips text that doesn’t say how much, or which way the money went', () => {
    expect(parseAlert('Your OTP is 482913. Do not share it.')).toBeNull();
    expect(parseAlert('Balance: NGN20,000.00')).toBeNull();
    expect(parseAlert('NGN5,000 on 17-11-2026')).toBeNull();
  });

  it('never invents an impossible date', () => {
    expect(parseAlert('Credit Alert Amt: NGN100 Date: 31-02-2026')?.date).toBeNull();
  });

  it('splits several pasted alerts and counts what it couldn’t read', () => {
    expect(splitAlerts(`${CREDIT}\n\n${DEBIT}`)).toHaveLength(2);
    expect(splitAlerts(`${CREDIT} Credit Alert! Amt: NGN1,000 Desc: Test`)).toHaveLength(2);
    const r = parseAlerts(`${CREDIT}\n\nhello there\n\n${SHORT}`);
    expect(r.alerts.map((a) => a.amount)).toEqual([45_000, 18_200]);
    expect(r.skipped).toBe(1);
  });
});
