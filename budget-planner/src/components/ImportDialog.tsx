import { useMemo, useState, type DragEvent } from 'react';
import { shortDate, type Transaction, type TxType } from '../lib/budget';
import {
  buildImport,
  detectDateFormat,
  EMPTY_MAP,
  guessMapping,
  guessMappingFromData,
  parseCSV,
  parseSignedAmount,
  type ColumnMap,
  type DateFormat,
} from '../lib/csv';
import { useFormat } from '../lib/format';
import type { AppData } from '../lib/store';
import { Modal } from './Modal';

const MAX_BYTES = 5_000_000;
const PREVIEW_ROWS = 100;

export function ImportDialog({ open, onClose, data, onImport }: {
  open: boolean;
  onClose: () => void;
  data: AppData;
  onImport: (txs: Transaction[]) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Import from CSV" wide>
      <ImportBody data={data} onImport={onImport} onCancel={onClose} />
    </Modal>
  );
}

function ImportBody({ data, onImport, onCancel }: {
  data: AppData;
  onImport: (txs: Transaction[]) => void;
  onCancel: () => void;
}) {
  const { money } = useFormat();
  const [source, setSource] = useState<{ name: string; rows: string[][] } | null>(null);
  const [paste, setPaste] = useState('');
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [hasHeader, setHasHeader] = useState(true);
  const [map, setMap] = useState<ColumnMap>(EMPTY_MAP);
  const [dateFormat, setDateFormat] = useState<DateFormat>('mdy');
  const [positiveIs, setPositiveIs] = useState<TxType>('income');

  const load = (text: string, name: string) => {
    const rows = parseCSV(text);
    if (rows.length === 0) {
      setError('No rows found. Check that this is a CSV file.');
      return;
    }
    const fromHeader = guessMapping(rows[0]);
    const headed = fromHeader.date !== -1;
    const body = headed ? rows.slice(1) : rows;
    const m = headed ? fromHeader : guessMappingFromData(rows);
    setSource({ name, rows });
    setHasHeader(headed);
    setMap(m);
    setDateFormat(detectDateFormat(body.map((r) => r[m.date] ?? '')));
    // All-positive amounts usually means a spending-only export (e.g. a credit card).
    const anyNegative = m.amount >= 0 && body.some((r) => (parseSignedAmount(r[m.amount] ?? '') ?? 0) < 0);
    setPositiveIs(m.amount >= 0 && !anyNegative ? 'expense' : 'income');
    setError('');
  };

  const readFile = (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_BYTES) return setError('That file is over 5 MB. Try exporting a shorter date range.');
    f.text().then((t) => load(t, f.name), () => setError('Couldn’t read that file.'));
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    readFile(e.dataTransfer.files[0]);
  };

  const columns = useMemo(() => {
    if (!source) return [];
    const width = Math.max(...source.rows.slice(0, 20).map((r) => r.length));
    return Array.from({ length: width }, (_, i) =>
      hasHeader && source.rows[0][i]?.trim() ? source.rows[0][i].trim() : `Column ${i + 1}`,
    );
  }, [source, hasHeader]);

  const body = useMemo(() => (source ? (hasHeader ? source.rows.slice(1) : source.rows) : []), [source, hasHeader]);

  const result = useMemo(
    () =>
      buildImport(body, {
        map,
        dateFormat,
        positiveIs,
        expenseCategories: data.settings.expenseCategories,
        incomeCategories: data.settings.incomeCategories,
        existing: data.transactions,
      }),
    [body, map, dateFormat, positiveIs, data.settings.expenseCategories, data.settings.incomeCategories, data.transactions],
  );

  const toImport = result.filter((r) => r.status === 'new');
  const dupes = result.filter((r) => r.status === 'duplicate').length;
  const invalid = result.filter((r) => r.status === 'invalid').length;
  const splitMode = map.amount === -1;

  if (!source) {
    return (
      <div className="import-start">
        <p className="modal-text">
          Most banks and card providers let you download transactions as a CSV file. Ledgerly works out which column is
          which, and you can check and fix it before anything is added.
        </p>
        <label
          className={`dropzone ${dragging ? 'is-over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <input id="import-file" type="file" accept=".csv,.tsv,.txt,text/csv" onChange={(e) => readFile(e.target.files?.[0])} />
          <strong>Choose a CSV file</strong>
          <span className="muted">or drop it here</span>
        </label>
        <details className="paste">
          <summary>Paste CSV text instead</summary>
          <textarea
            id="import-paste"
            className="csv-box"
            rows={6}
            placeholder={'Date,Description,Amount\n2026-11-03,Corner Café,-4.50'}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
          />
          <button type="button" className="btn-ghost" disabled={!paste.trim()} onClick={() => load(paste, 'Pasted text')}>
            Preview
          </button>
        </details>
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    );
  }

  const col = (field: keyof ColumnMap, label: string, required = false) => (
    <label className="field">
      <span>{label}</span>
      <select id={`map-${field}`} value={map[field]} onChange={(e) => setMap({ ...map, [field]: Number(e.target.value) })}>
        <option value={-1}>{required ? 'Choose a column…' : 'None'}</option>
        {columns.map((c, i) => (
          <option key={i} value={i}>{c}</option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="import">
      <div className="import-file">
        <span><strong>{source.name}</strong> · {body.length} rows</span>
        <button type="button" className="btn-ghost" onClick={() => setSource(null)}>Choose another</button>
      </div>

      <div className="map-grid">
        {col('date', 'Date', true)}
        {splitMode ? (
          <>
            {col('debit', 'Money out')}
            {col('credit', 'Money in')}
          </>
        ) : (
          col('amount', 'Amount', true)
        )}
        {col('note', 'Description')}
        {col('category', 'Category')}
        {col('type', 'Income/expense')}
      </div>

      <div className="import-opts">
        <label className="check inline">
          <input id="opt-header" type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />
          <span>First row is column names</span>
        </label>
        <label className="check inline">
          <input
            id="opt-split"
            type="checkbox"
            checked={splitMode}
            onChange={(e) =>
              setMap(e.target.checked ? { ...map, amount: -1 } : { ...map, amount: map.debit >= 0 ? map.debit : map.credit, debit: -1, credit: -1 })
            }
          />
          <span>Separate money-in and money-out columns</span>
        </label>
        <label className="field inline">
          <span>Dates look like</span>
          <select id="opt-datefmt" value={dateFormat} onChange={(e) => setDateFormat(e.target.value as DateFormat)}>
            <option value="mdy">Month/Day/Year (11/14/2026)</option>
            <option value="dmy">Day/Month/Year (14/11/2026)</option>
          </select>
        </label>
        {!splitMode && map.type === -1 && (
          <label className="field inline">
            <span>Positive amounts are</span>
            <select id="opt-positive" value={positiveIs} onChange={(e) => setPositiveIs(e.target.value as TxType)}>
              <option value="income">Money in (bank account)</option>
              <option value="expense">Spending (credit card)</option>
            </select>
          </label>
        )}
      </div>

      <p className="import-summary" aria-live="polite">
        <span className="pill ok">{toImport.length} to import</span>
        {dupes > 0 && <span className="pill dup">{dupes} already in Ledgerly</span>}
        {invalid > 0 && <span className="pill bad">{invalid} can’t be read</span>}
      </p>

      <div className="preview-wrap">
        <table className="preview">
          <thead>
            <tr><th>Date</th><th>Description</th><th>Category</th><th className="r">Amount</th><th>Status</th></tr>
          </thead>
          <tbody>
            {result.slice(0, PREVIEW_ROWS).map((r) => (
              <tr key={r.line} className={`st-${r.status}`}>
                {r.tx ? (
                  <>
                    <td className="nowrap">{shortDate(r.tx.date)}</td>
                    <td className="desc">{r.tx.note || <span className="muted">—</span>}</td>
                    <td className="nowrap">{r.tx.category}</td>
                    <td className={`r num nowrap ${r.tx.type}`}>{r.tx.type === 'income' ? '+' : '−'}{money(r.tx.amount)}</td>
                  </>
                ) : (
                  <td colSpan={4} className="muted">Row {r.line}: {(body[r.line - 1] ?? []).join(', ').slice(0, 80)}</td>
                )}
                <td className="nowrap">{r.status === 'new' ? 'New' : r.status === 'duplicate' ? 'Skip: duplicate' : `Skip: ${r.reason?.toLowerCase()}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {result.length > PREVIEW_ROWS && <p className="hint">Showing the first {PREVIEW_ROWS} of {result.length} rows.</p>}
      </div>

      <p className="hint">
        Rows whose category doesn’t match one of yours go into “Other”. You can rename categories in Settings.
      </p>

      <div className="modal-foot">
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button
          type="button"
          className="btn-primary sm"
          disabled={toImport.length === 0}
          onClick={() => onImport(toImport.map((r) => r.tx!))}
        >
          Import {toImport.length} {toImport.length === 1 ? 'transaction' : 'transactions'}
        </button>
      </div>
    </div>
  );
}
