import { prisma } from "@/infrastructure/database/client";
import { logger } from "@/infrastructure/observability";
import { createTickLoader } from "@/infrastructure/role-ticks";
import type { Tick } from "@/lib/role-tick";

/** The one batch loader every people-returning use case shares. */
export const loadTicks = createTickLoader(prisma);

type Ticked = { tick?: Tick | null };

/** Adds `tick` to each row in one query. Best effort: on failure, rows show without one. */
export async function addTicks<T>(
  rows: readonly T[],
  idOf: (row: T) => string,
  targetOf: (row: T) => Ticked = (row) => row as Ticked
): Promise<void> {
  if (rows.length === 0) return;
  let ticks: Map<string, Tick>;
  try {
    ticks = await loadTicks([...new Set(rows.map(idOf))]);
  } catch (error) {
    logger.warn("ticks.load_failed", { error });
    return;
  }
  for (const row of rows) targetOf(row).tick = ticks.get(idOf(row)) ?? null;
}
