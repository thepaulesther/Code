import { useState } from 'react';
import { fileDate, downloadText } from '../lib/download';
import { IS_ARTIFACT } from '../lib/pwa';
import { BrandMark, Icon } from './ui/Icon';

/**
 * Shown instead of the app when the saved data can't be used safely. Nothing here writes to the saved
 * data except "Start fresh", which first keeps a copy and needs an explicit confirmation.
 */
export function RecoveryScreen({ kind, reason, raw, onStartFresh }: {
  kind: 'newer' | 'unreadable';
  reason: string;
  /** The saved data exactly as stored. */
  raw: string;
  /** Returns false when a copy couldn't be kept, in which case nothing changes. */
  onStartFresh: () => boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [showText, setShowText] = useState(false);
  const [freshError, setFreshError] = useState(false);

  const download = () => {
    if (IS_ARTIFACT || !downloadText(`elora-saved-data-${fileDate()}.json`, raw)) setShowText(true);
  };

  return (
    <main className="recovery" aria-labelledby="recovery-title">
      <div className="recovery-card">
        <div className="brand"><BrandMark /><span className="brand-name">Elora</span></div>
        <span className="recovery-icon"><Icon name="alert" size={24} /></span>
        <h1 id="recovery-title" tabIndex={-1}>
          {kind === 'newer' ? 'Your data was saved by a newer version of Elora' : 'Elora couldn’t open your saved data'}
        </h1>
        <p>
          {kind === 'newer'
            ? 'This copy of the app is older than the one that last saved your data. To protect it, Elora won’t open or change it here. Reloading usually brings the newer version.'
            : reason}
        </p>
        <p className="recovery-safe">
          <Icon name="lock" size={16} />
          <span>Your saved data hasn’t been changed or deleted.</span>
        </p>

        <div className="recovery-actions">
          {kind === 'newer' && (
            <button type="button" className="btn-primary auto" onClick={() => window.location.reload()}>
              Reload Elora
            </button>
          )}
          <button type="button" className={kind === 'newer' ? 'btn-secondary' : 'btn-primary auto'} onClick={download}>
            <Icon name="download" size={18} /> Download my saved data
          </button>
        </div>

        {showText && (
          <label className="field">
            <span>Your saved data (select all and copy it somewhere safe)</span>
            <textarea id="recovery-raw" className="csv-box" readOnly rows={6} value={raw} />
          </label>
        )}

        {kind === 'unreadable' && (
          <div className="recovery-fresh">
            {!confirming ? (
              <button type="button" className="btn-ghost" onClick={() => setConfirming(true)}>
                Start fresh instead…
              </button>
            ) : (
              <div className="confirm-row" role="group" aria-label="Start fresh">
                <label className="check">
                  <input id="recovery-understood" type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
                  <span>
                    I’ve downloaded my saved data, or I don’t need it
                    <small>Elora keeps a copy of it in this browser and opens with no data. You can restore a backup later in Settings.</small>
                  </span>
                </label>
                <div className="head-actions">
                  <button type="button" className="btn-ghost" onClick={() => setConfirming(false)}>Cancel</button>
                  <button type="button" className="btn-danger" disabled={!understood} onClick={() => setFreshError(!onStartFresh())}>
                    Start with no data
                  </button>
                </div>
                {freshError && (
                  <p className="error" role="alert">
                    Elora couldn’t keep a copy of your saved data (browser storage may be full), so nothing was changed.
                    Download it first, then free some space in your browser’s site settings.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
