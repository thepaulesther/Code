import { useEffect, useState } from 'react';
import { countsOf, parseBackup, type BackupInfo } from '../lib/backup';
import type { Store } from '../lib/books';
import { Modal } from './Modal';
import { Icon } from './ui/Icon';

type Step =
  | { kind: 'choose' }
  | { kind: 'checking' }
  | { kind: 'problems'; problems: string[] }
  | { kind: 'preview'; data: Store; info: BackupInfo };

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Not recorded';
const day = (d: string | null) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—';

/**
 * Restore a full backup. The file is read and checked before anything changes, the user sees what it
 * holds next to what they have now, and replacing needs an explicit confirmation.
 */
export function RestoreDialog({ open, onClose, initialText, current, onRestore }: {
  open: boolean;
  onClose: () => void;
  /** Text to check straight away (e.g. a safety copy chosen in Settings). */
  initialText?: string;
  current: Store;
  onRestore: (data: Store) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Restore from backup" wide>
      {open && <RestoreBody key={initialText ?? ''} initialText={initialText} current={current} onRestore={onRestore} onCancel={onClose} />}
    </Modal>
  );
}

function RestoreBody({ initialText, current, onRestore, onCancel }: {
  initialText?: string;
  current: Store;
  onRestore: (data: Store) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<Step>(initialText ? { kind: 'checking' } : { kind: 'choose' });
  const [paste, setPaste] = useState('');
  const [understood, setUnderstood] = useState(false);

  const check = async (text: string) => {
    setStep({ kind: 'checking' });
    const r = await parseBackup(text);
    setStep(r.ok ? { kind: 'preview', data: r.data, info: r.info } : { kind: 'problems', problems: r.problems });
  };

  // A safety copy chosen in Settings is checked straight away (the component remounts per text).
  useEffect(() => {
    if (initialText) void check(initialText);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const readFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 20_000_000) return setStep({ kind: 'problems', problems: ['This file is too large to be an Elora backup.'] });
    file.text().then(check, () => setStep({ kind: 'problems', problems: ['The file couldn’t be read.'] }));
  };

  if (step.kind === 'checking') return <p className="modal-text" role="status">Checking the backup…</p>;

  if (step.kind === 'choose' || step.kind === 'problems') {
    return (
      <div className="import-start">
        <p className="modal-text">
          Choose an Elora backup file (<code>elora-backup-….json</code>). It’s checked first; nothing changes until you
          confirm on the next screen.
        </p>
        {step.kind === 'problems' && (
          <div className="restore-problems" role="alert">
            <strong>This backup can’t be restored</strong>
            <ul>
              {step.problems.slice(0, 8).map((p) => <li key={p}>{p}</li>)}
            </ul>
            {step.problems.length > 8 && <p className="hint">…and {step.problems.length - 8} more problems.</p>}
            <p className="hint">Your current data hasn’t been changed.</p>
          </div>
        )}
        <label className="dropzone">
          <input id="restore-file" type="file" accept=".json,application/json" onChange={(e) => readFile(e.target.files?.[0])} />
          <Icon name="import" size={22} />
          <strong>Choose a backup file</strong>
          <span className="muted">or drop it here</span>
        </label>
        <details className="paste">
          <summary>Paste the backup text instead</summary>
          <textarea id="restore-paste" className="csv-box" rows={6} value={paste} onChange={(e) => setPaste(e.target.value)} aria-label="Backup text" />
          <button type="button" className="btn-ghost" disabled={!paste.trim()} onClick={() => void check(paste)}>Check this text</button>
        </details>
        <div className="modal-foot">
          <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    );
  }

  const now = countsOf(current);
  const { info } = step;
  const rows: [string, string | number, string | number][] = [
    ['Transactions', now.transactions, info.counts.transactions],
    ['Repeating items', now.repeating, info.counts.repeating],
    ['Budgets', now.budgets, info.counts.budgets],
    ['Savings goals', now.goals, info.counts.goals],
    ['Base currency', current.settings.currency || 'Not chosen', info.currency || 'Not chosen'],
  ];
  return (
    <div className="import">
      <p className="modal-text">
        {info.kind === 'backup'
          ? <>Backup made <strong>{when(info.exportedAt)}</strong>, with transactions from {day(info.firstDate)} to {day(info.lastDate)}.</>
          : <>Saved data (not a backup file), with transactions from {day(info.firstDate)} to {day(info.lastDate)}.</>}{' '}
        {info.checksum === 'verified'
          ? 'Its checksum matches, so it hasn’t been changed since it was made.'
          : 'It has no checksum, but every record passed Elora’s checks.'}
        {info.upgradedFrom != null && ` It was saved by an older version of Elora and will be upgraded.`}
      </p>
      <div className="preview-wrap">
        <table className="preview">
          <thead>
            <tr><th scope="col"></th><th scope="col" className="r">In this browser now</th><th scope="col" className="r">In the backup</th></tr>
          </thead>
          <tbody>
            {rows.map(([label, a, b]) => (
              <tr key={label}><th scope="row">{label}</th><td className="r num">{a}</td><td className="r num">{b}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="confirm-row" role="group" aria-label="Confirm restore">
        <label className="check">
          <input id="restore-confirm" type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
          <span>
            Replace everything in this browser with this backup
            <small>Your current data is kept as a safety copy first, and you can undo straight after.</small>
          </span>
        </label>
      </div>
      <div className="modal-foot">
        <button type="button" className="btn-ghost" onClick={() => setStep({ kind: 'choose' })}>Choose another file</button>
        <button type="button" className="btn-danger" disabled={!understood} onClick={() => onRestore(step.data)}>
          Replace my data
        </button>
      </div>
    </div>
  );
}
