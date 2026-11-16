/** localStorage helpers that never throw (private mode, blocked storage, quota, bad JSON). */

export function readJSON(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Saves `value`; returns false when the browser refused (storage full or blocked). */
export function writeJSON(key: string, value: unknown): boolean {
  return writeRaw(key, JSON.stringify(value));
}

/** The stored text exactly as it is, or null when absent or unreadable. */
export function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeRaw(key: string, text: string): boolean {
  try {
    localStorage.setItem(key, text);
    return true;
  } catch {
    // Storage full or unavailable; the caller decides what to tell the user.
    return false;
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing more to do.
  }
}

/** Keys that start with `prefix`. */
export function keysWithPrefix(prefix: string): string[] {
  try {
    return Object.keys(localStorage).filter((k) => k.startsWith(prefix));
  } catch {
    return [];
  }
}
