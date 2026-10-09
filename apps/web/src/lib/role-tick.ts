/** The colour says what kind of account it is; the label names the role. */
import { ROLE_TICKS } from "@nitap/database/role-ticks";
import type { TickKind } from "@nitap/ui/components/role-tick";

export type { TickKind };

export type Tick = { role: string; label: string; kind: TickKind };

const ROLES = ROLE_TICKS;

/** The stored preference that hides the tick. NULL (no preference) means automatic. */
export const NO_TICK = "NONE";

/** The ticks a member may choose from, highest first. Unknown role names are ignored. */
export function tickOptions(roles: readonly string[]): Tick[] {
  return ROLES.filter((r) => roles.includes(r.role)).map(
    ({ role, label, kind }) => ({ role, label, kind })
  );
}

/** None for unverified or hidden; the chosen role while still held; else the highest held role. */
export function pickTick(input: {
  verified: boolean;
  roles: readonly string[];
  preference: string | null;
}): Tick | null {
  if (!input.verified || input.preference === NO_TICK) return null;
  const options = tickOptions(input.roles);
  return options.find((o) => o.role === input.preference) ?? options[0] ?? null;
}

/** Batch lookup of the ticks to draw for these users; users without a tick are absent from the map. */
export type TickLoader = (
  userIds: readonly string[]
) => Promise<Map<string, Tick>>;

/** Loads ticks for `ids` and returns `idOf(row)`'s tick (or null) for each row, in one query. */
export async function ticksFor<T>(
  load: TickLoader,
  rows: readonly T[],
  idOf: (row: T) => string
): Promise<(Tick | null)[]> {
  if (rows.length === 0) return [];
  const ticks = await load([...new Set(rows.map(idOf))]);
  return rows.map((row) => ticks.get(idOf(row)) ?? null);
}
