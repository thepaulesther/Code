import { useEffect, useState } from 'react';

/** Read a JSON value from localStorage, falling back if storage is blocked or the value is corrupt. */
export function readStored<T>(key: string, fallback: () => T, isValid: (v: unknown) => v is T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw != null) {
      const parsed: unknown = JSON.parse(raw);
      if (isValid(parsed)) return parsed;
    }
  } catch {
    // Private mode / blocked storage / bad JSON: use the fallback.
  }
  return fallback();
}

/** useState that mirrors its value into localStorage. */
export function usePersistentState<T>(key: string, initial: () => T, isValid: (v: unknown) => v is T) {
  const [value, setValue] = useState<T>(() => readStored(key, initial, isValid));
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or unavailable; the app keeps working in memory.
    }
  }, [key, value]);
  return [value, setValue] as const;
}
