import { useEffect, useRef, useState } from 'react';
import { readJSON, writeJSON } from './storage';

/** Per-device memory for the setup guide: whether it's hidden and which optional steps were skipped. */
export interface SetupPrefs {
  hidden: boolean;
  skipped: string[];
}

const KEY = 'elora.setup';

export function readSetupPrefs(): SetupPrefs {
  const v = readJSON(KEY) as Partial<SetupPrefs> | undefined;
  return {
    hidden: v?.hidden === true,
    skipped: Array.isArray(v?.skipped) ? v.skipped.filter((s): s is string => typeof s === 'string') : [],
  };
}

export function useSetupPrefs() {
  const [prefs, setPrefs] = useState<SetupPrefs>(readSetupPrefs);
  // Save after the change is applied (not inside the updater, which React may run twice).
  const loaded = useRef(true);
  useEffect(() => {
    if (loaded.current) {
      loaded.current = false; // nothing to save on first render: it was just read
      return;
    }
    writeJSON(KEY, prefs);
  }, [prefs]);
  // Each update works from the latest value, so two quick clicks can't drop one.
  const update = (change: (p: SetupPrefs) => Partial<SetupPrefs>) => setPrefs((p) => ({ ...p, ...change(p) }));
  return {
    prefs,
    hide: () => update(() => ({ hidden: true })),
    show: () => update(() => ({ hidden: false })),
    skip: (id: string) => update((p) => ({ skipped: [...new Set([...p.skipped, id])] })),
    unskip: (id: string) => update((p) => ({ skipped: p.skipped.filter((s) => s !== id) })),
    /** Back to a fresh guide, e.g. after "Delete all data". */
    reset: () => update(() => ({ hidden: false, skipped: [] })),
  };
}
