import { createContext, useContext, useMemo } from 'react';
import { categoryColor, currencySymbol, DEFAULT_EXPENSE_CATEGORIES, formatMoney } from './budget';

export interface Prefs {
  currency: string;
  expenseCategories: string[];
}

export const PrefsContext = createContext<Prefs>({
  currency: '',
  expenseCategories: DEFAULT_EXPENSE_CATEGORIES,
});

/** Currency- and category-aware formatters for components. */
export function useFormat() {
  const { currency, expenseCategories } = useContext(PrefsContext);
  return useMemo(
    () => ({
      currency,
      symbol: currencySymbol(currency),
      money: (n: number, opts?: { compact?: boolean }) => formatMoney(n, currency, { ...opts, narrow: true }),
      color: (category: string) => categoryColor(category, expenseCategories),
    }),
    [currency, expenseCategories],
  );
}
