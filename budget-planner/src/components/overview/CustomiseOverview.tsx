import { useRef, useState } from 'react';
import { isDefaultLayout, sectionLabel, type LayoutPrefs, type SectionId } from '../../lib/layout';
import { Icon } from '../ui/Icon';

/**
 * Reorder and hide the Overview's sections. Moving uses buttons rather than dragging, so it works the
 * same with a keyboard, a screen reader or a finger; each move is announced.
 */
export function CustomiseOverview({ prefs, onMove, onHide, onReset, onDone }: {
  prefs: LayoutPrefs;
  onMove: (id: SectionId, by: -1 | 1) => void;
  onHide: (id: SectionId, hidden: boolean) => void;
  onReset: () => void;
  onDone: () => void;
}) {
  const [said, setSaid] = useState('');
  const list = useRef<HTMLOListElement>(null);
  const n = prefs.order.length;

  const move = (id: SectionId, by: -1 | 1) => {
    const to = prefs.order.indexOf(id) + by;
    onMove(id, by);
    setSaid(`${sectionLabel(id)} moved to position ${to + 1} of ${n}.`);
    // At the top or bottom, the pressed button is disabled: keep focus on the row's other button.
    const edge = (by === -1 && to === 0) || (by === 1 && to === n - 1);
    if (edge) {
      requestAnimationFrame(() =>
        list.current?.querySelector<HTMLButtonElement>(`[data-section="${id}"] [data-move="${by === -1 ? 'down' : 'up'}"]`)?.focus(),
      );
    }
  };

  return (
    <div className="customise">
      <p className="hint">
        Choose what the Overview shows, and in what order. Your balance and quick actions always stay at the top. This is
        saved on this device only.
      </p>
      <ol className="customise-list" ref={list}>
        {prefs.order.map((id, i) => {
          const hidden = prefs.hidden.includes(id);
          const label = sectionLabel(id);
          return (
            <li key={id} data-section={id} className={hidden ? 'is-hidden' : undefined}>
              <label className="check">
                <input type="checkbox" checked={!hidden} onChange={(e) => onHide(id, !e.target.checked)} />
                <span>{label}</span>
              </label>
              <span className="customise-moves">
                <button
                  type="button"
                  className="icon-btn"
                  data-move="up"
                  disabled={i === 0}
                  aria-label={`Move ${label} up`}
                  onClick={() => move(id, -1)}
                >
                  <Icon name="chevron-left" size={18} className="rot-up" />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  data-move="down"
                  disabled={i === n - 1}
                  aria-label={`Move ${label} down`}
                  onClick={() => move(id, 1)}
                >
                  <Icon name="chevron-left" size={18} className="rot-down" />
                </button>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="sr-only" aria-live="polite">{said}</p>
      <div className="modal-foot">
        <button
          type="button"
          className="btn-ghost sm"
          disabled={isDefaultLayout(prefs)}
          onClick={() => {
            onReset();
            setSaid('Overview reset to the default layout.');
          }}
        >
          Reset to default
        </button>
        <button type="button" className="btn-primary sm" onClick={onDone}>Done</button>
      </div>
    </div>
  );
}
