import { useState } from 'react';
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
  const update = (patch: Partial<SetupPrefs>) =>
    setPrefs((p) => {
      const next = { ...p, ...patch };
      writeJSON(KEY, next);
      return next;
    });
  return {
    prefs,
    hide: () => update({ hidden: true }),
    show: () => update({ hidden: false }),
    skip: (id: string) => update({ skipped: [...new Set([...prefs.skipped, id])] }),
    unskip: (id: string) => update({ skipped: prefs.skipped.filter((s) => s !== id) }),
  };
}
