import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './ui/Icon';

/** Native <dialog> with focus trapping, Esc to close, and click-outside to close. */
export function Modal({ open, onClose, title, wide, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  wide?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // Move focus to the field marked data-autofocus (e.g. the amount), once the dialog is open.
      d.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
    else if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'wide' : ''}`}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={title}
    >
      {open && (
        <div className="modal-inner">
          <div className="modal-head">
            <h2>{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
