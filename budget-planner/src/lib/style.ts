import { useState } from 'react';
import { readJSON, writeJSON } from './storage';

/**
 * Elora's two looks. Tide (lagoon, dawn gold, Sora and Figtree) is the default; Forest is the original
 * forest, sage and cream. A per-device display preference, kept apart from the financial data.
 */
export type BrandStyle = 'tide' | 'forest';

export const STYLES: readonly { id: BrandStyle; label: string }[] = [
  { id: 'tide', label: 'Tide' },
  { id: 'forest', label: 'Forest' },
];

const KEY = 'elora.style';

export const readStyle = (): BrandStyle => (readJSON(KEY) === 'forest' ? 'forest' : 'tide');

/** Show the style: the stylesheet switches colours, type, logo and name on `data-brand`. */
export function applyStyle(style: BrandStyle): void {
  if (style === 'forest') document.documentElement.dataset.brand = 'forest';
  else delete document.documentElement.dataset.brand;
}

export function useStyle() {
  const [style, setState] = useState<BrandStyle>(readStyle);
  const setStyle = (next: BrandStyle) => {
    setState(next);
    applyStyle(next);
    writeJSON(KEY, next);
  };
  return [style, setStyle] as const;
}
