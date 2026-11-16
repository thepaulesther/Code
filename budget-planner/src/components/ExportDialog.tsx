import { useRef, useState } from 'react';
import { todayISO } from '../lib/budget';
import { Modal } from './Modal';

export function ExportDialog({ open, onClose, csv, count, canDownload }: {
  open: boolean;
  onClose: () => void;
  csv: string;
  count: number;
  canDownload: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState<'yes' | 'select' | null>(null);

  const copy = () => {
    navigator.clipboard
      .writeText(csv)
      .then(() => setCopied('yes'))
      .catch(() => {
        ref.current?.select();
        setCopied('select');
      });
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `elora-${todayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal open={open} onClose={onClose} title="Export transactions">
      <p className="modal-text">
        All {count} transactions as CSV (date, type, category, amount, note). You can open it in a spreadsheet, or
        import it back into Elora on another device.
      </p>
      <textarea ref={ref} id="export-csv" className="csv-box" readOnly value={csv} rows={9} aria-label="CSV data" />
      {copied === 'select' && <p className="hint">Copying isn’t allowed here. The text is selected, so press Ctrl+C or ⌘C.</p>}
      <div className="modal-foot">
        <button type="button" className="btn-ghost" onClick={copy}>{copied === 'yes' ? 'Copied' : 'Copy CSV'}</button>
        {canDownload && <button type="button" className="btn-primary sm" onClick={download}>Download .csv</button>}
      </div>
    </Modal>
  );
}
