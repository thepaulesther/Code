import { describe, expect, it } from 'vitest';
import { arrangeRows, DEFAULT_ORDER, defaultLayout, isDefaultLayout, moveSection, normaliseLayout } from './layout';

describe('normaliseLayout', () => {
  it('falls back to the default for missing or damaged values', () => {
    for (const bad of [undefined, null, 'oops', 42, [], { order: 'x', hidden: {} }]) {
      expect(normaliseLayout(bad)).toEqual({ order: [...DEFAULT_ORDER], hidden: [], dismissedMonthEnd: [] });
    }
  });

  it('keeps a saved order, dropping unknown and repeated entries', () => {
    const order = ['insights', 'budgets', 'nope', 'budgets', 'upcoming', 'trend', 'activity', 'goals'];
    expect(normaliseLayout({ order }).order).toEqual(['insights', 'budgets', 'upcoming', 'trend', 'activity', 'goals']);
  });

  it('puts sections missing from the saved order back near their default place', () => {
    // As if "trend" were added in a later version: it goes after "budgets", its default predecessor.
    expect(normaliseLayout({ order: ['insights', 'budgets', 'upcoming', 'activity', 'goals'] }).order).toEqual([
      'insights', 'budgets', 'trend', 'upcoming', 'activity', 'goals',
    ]);
    expect(normaliseLayout({ order: ['goals'] }).order).toEqual(['upcoming', 'budgets', 'trend', 'activity', 'goals', 'insights']);
  });

  it('keeps valid hidden sections and dismissed months, and only the latest 12 months', () => {
    const months = Array.from({ length: 14 }, (_, i) => `2026-${String((i % 12) + 1).padStart(2, '0')}`).concat('2027-01', 'bad');
    const p = normaliseLayout({ hidden: ['goals', 'x', 'goals'], dismissedMonthEnd: months });
    expect(p.hidden).toEqual(['goals']);
    expect(p.dismissedMonthEnd).toHaveLength(12);
    expect(p.dismissedMonthEnd.at(-1)).toBe('2027-01');
  });
});

describe('moveSection', () => {
  it('moves up and down, and stops at the ends', () => {
    expect(moveSection(['upcoming', 'budgets', 'trend'], 'budgets', -1)).toEqual(['budgets', 'upcoming', 'trend']);
    expect(moveSection(['upcoming', 'budgets', 'trend'], 'budgets', 1)).toEqual(['upcoming', 'trend', 'budgets']);
    expect(moveSection(['upcoming', 'budgets'], 'upcoming', -1)).toEqual(['upcoming', 'budgets']);
    expect(moveSection(['upcoming', 'budgets'], 'budgets', 1)).toEqual(['upcoming', 'budgets']);
  });
});

describe('isDefaultLayout', () => {
  it('is true only for the default order with nothing hidden', () => {
    expect(isDefaultLayout(defaultLayout())).toBe(true);
    expect(isDefaultLayout({ ...defaultLayout(), hidden: ['goals'] })).toBe(false);
    expect(isDefaultLayout({ ...defaultLayout(), order: moveSection(DEFAULT_ORDER, 'goals', -1) })).toBe(false);
  });
});

describe('arrangeRows', () => {
  it('pairs sections, gives the trend chart the wider side, and spans a lone section', () => {
    expect(arrangeRows(DEFAULT_ORDER)).toEqual([
      { id: 'upcoming', span: 6 }, { id: 'budgets', span: 6 },
      { id: 'trend', span: 7 }, { id: 'activity', span: 5 },
      { id: 'goals', span: 6 }, { id: 'insights', span: 6 },
    ]);
    expect(arrangeRows(['goals', 'trend', 'budgets'])).toEqual([
      { id: 'goals', span: 5 }, { id: 'trend', span: 7 }, { id: 'budgets', span: 12 },
    ]);
    expect(arrangeRows([])).toEqual([]);
  });
});
