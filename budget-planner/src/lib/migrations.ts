/**
 * Versioned upgrades of the stored data. Each step turns version n into n + 1 and is a pure function,
 * so it can be tested on its own and run on a copy: nothing is saved unless every step succeeds and
 * the result passes validation (see `openStore` in store.ts).
 *
 * Adding a format: bump CURRENT_VERSION, append a step, add tests with real old-format fixtures.
 */

export const CURRENT_VERSION = 2;

export interface Migration {
  from: number;
  to: number;
  describe: string;
  run: (data: Record<string, unknown>) => Record<string, unknown>;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export const MIGRATIONS: Migration[] = [
  {
    from: 1,
    to: 2,
    describe: 'The first version kept transactions and budgets under separate keys and only worked in US dollars.',
    run: (d) => ({
      version: 2,
      transactions: Array.isArray(d.transactions) ? d.transactions : [],
      budgets: isObj(d.budgets) ? d.budgets : {},
      recurring: [],
      // Missing settings are filled with defaults by the loader.
      settings: { currency: 'USD' },
    }),
  },
];

export type MigrationResult =
  | { ok: true; data: Record<string, unknown>; from: number; steps: number }
  | { ok: false; reason: string };

/** The version stored data says it is, or null when it doesn't say. */
export function versionOf(data: unknown): number | null {
  return isObj(data) && typeof data.version === 'number' && Number.isInteger(data.version) ? data.version : null;
}

/** Upgrade `data` to CURRENT_VERSION. Never changes its input. */
export function migrate(data: unknown, migrations: Migration[] = MIGRATIONS, target = CURRENT_VERSION): MigrationResult {
  const from = versionOf(data);
  if (from == null) return { ok: false, reason: 'It doesn’t say which version of Elora saved it.' };
  if (from > target) return { ok: false, reason: `It was saved by a newer version of Elora (data version ${from}).` };
  let current = structuredClone(data) as Record<string, unknown>;
  let steps = 0;
  for (let v = from; v < target; v++) {
    const step = migrations.find((m) => m.from === v && m.to === v + 1);
    if (!step) return { ok: false, reason: `There’s no upgrade from data version ${v}.` };
    try {
      current = step.run(current);
    } catch (e) {
      return { ok: false, reason: `Upgrading from version ${v} failed: ${e instanceof Error ? e.message : String(e)}` };
    }
    if (versionOf(current) !== v + 1) return { ok: false, reason: `Upgrading from version ${v} didn’t produce version ${v + 1}.` };
    steps++;
  }
  return { ok: true, data: current, from, steps };
}
