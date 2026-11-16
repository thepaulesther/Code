import { useEffect, useRef, useState } from 'react';
import { readJSON, writeJSON } from './storage';

/**
 * Per-device Overview preferences: the order of its sections, which are hidden, and which month-end
 * check-ins were dismissed. Display preferences only, so they're kept apart from the financial data
 * (no migration, not part of backups).
 */
export type SectionId = 'upcoming' | 'budgets' | 'trend' | 'activity' | 'goals' | 'insights';

export const SECTIONS: readonly { id: SectionId; label: string }[] = [
  { id: 'upcoming', label: 'Coming up' },
  { id: 'budgets', label: 'Budgets' },
  { id: 'trend', label: '6-month trend' },
  { id: 'activity', label: 'Recent activity' },
  { id: 'goals', label: 'Savings goals' },
  { id: 'insights', label: 'Insights' },
];

export const DEFAULT_ORDER: readonly SectionId[] = SECTIONS.map((s) => s.id);
export const sectionLabel = (id: SectionId) => SECTIONS.find((s) => s.id === id)!.label;

export interface LayoutPrefs {
  order: SectionId[];
  hidden: SectionId[];
  /** Months (YYYY-MM) whose month-end check-in was dismissed with "Not now". */
  dismissedMonthEnd: string[];
}

const KEY = 'elora.layout';
const isSection = (v: unknown): v is SectionId => typeof v === 'string' && (DEFAULT_ORDER as readonly string[]).includes(v);
const isMonth = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}$/.test(v);

/**
 * Make any stored value safe: unknown or repeated entries are dropped, and sections missing from the
 * saved order (such as ones added in a later version) go back in at their default position.
 */
export function normaliseLayout(value: unknown): LayoutPrefs {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const saved = Array.isArray(v.order) ? [...new Set(v.order.filter(isSection))] : [];
  const order = [...saved];
  DEFAULT_ORDER.forEach((id, i) => {
    if (order.includes(id)) return;
    // After the nearest section that comes before it by default, or first if there's none.
    const before = DEFAULT_ORDER.slice(0, i).reverse().find((x) => order.includes(x));
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, id);
  });
  return {
    order,
    hidden: Array.isArray(v.hidden) ? [...new Set(v.hidden.filter(isSection))] : [],
    dismissedMonthEnd: Array.isArray(v.dismissedMonthEnd) ? [...new Set(v.dismissedMonthEnd.filter(isMonth))].slice(-12) : [],
  };
}

export const defaultLayout = (): LayoutPrefs => normaliseLayout({});

/** Move a section one place up (-1) or down (+1). */
export function moveSection(order: readonly SectionId[], id: SectionId, by: -1 | 1): SectionId[] {
  const i = order.indexOf(id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= order.length) return [...order];
  const next = [...order];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export const isDefaultLayout = (p: LayoutPrefs) => p.hidden.length === 0 && p.order.every((id, i) => id === DEFAULT_ORDER[i]);

/**
 * Lay the shown sections out two to a row on wide screens: the trend chart takes the wider side of its
 * row, other pairs split evenly, and a section left on its own spans the full width. The order on
 * screen is always the order chosen, so it matches what screen readers and keyboards follow.
 */
export function arrangeRows(ids: readonly SectionId[]): { id: SectionId; span: 5 | 6 | 7 | 12 }[] {
  const out: { id: SectionId; span: 5 | 6 | 7 | 12 }[] = [];
  for (let i = 0; i < ids.length; i += 2) {
    const a = ids[i];
    const b = ids[i + 1];
    if (!b) out.push({ id: a, span: 12 });
    else if (a === 'trend') out.push({ id: a, span: 7 }, { id: b, span: 5 });
    else if (b === 'trend') out.push({ id: a, span: 5 }, { id: b, span: 7 });
    else out.push({ id: a, span: 6 }, { id: b, span: 6 });
  }
  return out;
}

export function useLayoutPrefs() {
  const [prefs, setPrefs] = useState<LayoutPrefs>(() => normaliseLayout(readJSON(KEY)));
  // Save after the change is applied (not inside the updater, which React may run twice).
  const loaded = useRef(true);
  useEffect(() => {
    if (loaded.current) {
      loaded.current = false;
      return;
    }
    writeJSON(KEY, prefs);
  }, [prefs]);
  const update = (change: (p: LayoutPrefs) => Partial<LayoutPrefs>) => setPrefs((p) => ({ ...p, ...change(p) }));
  return {
    prefs,
    move: (id: SectionId, by: -1 | 1) => update((p) => ({ order: moveSection(p.order, id, by) })),
    setHidden: (id: SectionId, hidden: boolean) =>
      update((p) => ({ hidden: hidden ? [...new Set([...p.hidden, id])] : p.hidden.filter((x) => x !== id) })),
    /** Default order, everything shown. Dismissed check-ins stay dismissed. */
    resetSections: () => update(() => ({ order: [...DEFAULT_ORDER], hidden: [] })),
    dismissMonthEnd: (month: string) => update((p) => ({ dismissedMonthEnd: [...new Set([...p.dismissedMonthEnd, month])].slice(-12) })),
    /** Everything back to default, e.g. after "Delete all data". */
    reset: () => setPrefs(defaultLayout()),
  };
}
