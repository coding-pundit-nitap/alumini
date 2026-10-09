import { Prisma, type PrismaClient } from "@nitap/database";

import type { TransactionRunner } from "@/infrastructure/database/transaction-runner";

/** Serializes concurrent adds to the same member's collections. */
export function lockProfileRow(
  tx: Prisma.TransactionClient,
  userId: string
): Promise<unknown> {
  return tx.$queryRaw`SELECT user_id FROM profile WHERE user_id = ${userId}::uuid FOR UPDATE`;
}

/**
 * A `date`/`timestamptz` column arrives as a UTC-midnight Date; the domain
 * speaks YYYY-MM-DD.
 */
export const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

export const isDuplicate = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2002";

export type CollectionDeps = {
  runner: Pick<TransactionRunner, "run">;
  prisma: PrismaClient;
};
