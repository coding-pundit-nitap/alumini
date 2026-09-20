import { expect } from "vitest";

import { Prisma } from "@nitap/database";

export type ConstraintCase = {
  /** The exact PostgreSQL constraint or index name this case exercises. */
  name: string;
  /** Performs the write that must be rejected by this constraint. */
  violate: (prisma: import("@nitap/database").PrismaClient) => Promise<unknown>;
};

/**
 * Asserts `error` is a PostgreSQL constraint violation naming exactly `constraintName` — never
 * just "an error was thrown". Catches an accidentally renamed or dropped constraint that some
 * other error still happens to be thrown for.
 */
export function expectConstraintViolation(
  error: unknown,
  constraintName: string
): void {
  expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  const known = error as InstanceType<
    typeof Prisma.PrismaClientKnownRequestError
  >;
  // P2002 unique, P2003 foreign key, P2010 raw query failed ($queryRaw). P2039 is what Prisma 7's
  // pg driver adapter (@prisma/adapter-pg) actually raises for a CHECK constraint hit through a
  // normal create/update call — its `meta` is empty, so the constraint name lives in `message`
  // (confirmed empirically against ck_profile_graduation_year; not documented in Prisma's error
  // code reference at the time of writing).
  expect(["P2002", "P2003", "P2010", "P2039"]).toContain(known.code);
  const meta = known.meta as
    | { target?: string[] | string; constraint?: string; message?: string }
    | undefined;
  const named =
    (Array.isArray(meta?.target) ? meta.target.join(",") : meta?.target) ??
    meta?.constraint ??
    meta?.message ??
    known.message;
  expect(String(named)).toContain(constraintName);
}
