// Every Server Action, signed out, discovered from "use server" files: none may succeed or write a row.
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

const mocks = vi.hoisted(() => ({
  dbRef: { current: null as TestDatabase | null },
}));

vi.mock("@/infrastructure/database/client", () => {
  const client = () => {
    if (!mocks.dbRef.current) throw new Error("test database not ready");
    return mocks.dbRef.current.prisma;
  };
  return {
    prisma: new Proxy(
      {},
      {
        get(_target, prop) {
          const value = (client() as unknown as Record<PropertyKey, unknown>)[
            prop
          ];
          return typeof value === "function" ? value.bind(client()) : value;
        },
      }
    ),
    pool: { totalCount: 0, idleCount: 0, waitingCount: 0 },
    transactionRunner: {
      run: (fn: (tx: unknown) => Promise<unknown>) => client().$transaction(fn),
    },
  };
});
vi.mock("@/modules/auth/infrastructure/actor", () => ({
  getActor: async () => null,
  loadGrants: async () => [],
}));
vi.mock("@/modules/auth/infrastructure/auth", () => ({ auth: {} }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }),
  cookies: async () => ({ get: () => undefined, set: () => {} }),
}));
vi.mock("next/cache", () => ({
  refresh: () => {},
  revalidatePath: () => {},
  revalidateTag: () => {},
  updateTag: () => {},
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

type Action = (...args: unknown[]) => Promise<unknown>;

const appRoot = path.resolve(import.meta.dirname, "../../src/app");
const ID = "4f9e3a52-7d1b-4c6e-9a2f-0b8d5e1c3a77";

function serverActionFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return serverActionFiles(full);
    if (!/\.tsx?$/.test(entry.name) || /\.test\./.test(entry.name)) return [];
    const head = fs.readFileSync(full, "utf8").trimStart();
    return /^["']use server["']/.test(head) ? [full] : [];
  });
}

/**
 * Plausible input in every shape the actions take, so a refusal is not just a
 * parse error.
 */
function argumentShapes(arity: number): unknown[][] {
  const form = new FormData();
  for (const field of [
    "id",
    "userId",
    "recipientId",
    "eventId",
    "jobId",
    "postId",
    "campaignId",
    "donationId",
    "reportId",
    "uploadId",
    "conversationId",
    "announcementId",
    "achievementId",
  ])
    form.set(field, ID);
  for (const [field, value] of Object.entries({
    title: "A title",
    body: "Some body text",
    reason: "A reason",
    note: "A note",
    amount: "100",
    reference: "REF-1",
    decision: "APPROVE",
    state: "ACCEPTED",
    rollNumber: "19CS001",
    graduationYear: "2020",
  }))
    form.set(field, value);
  const n = Math.max(arity, 1);
  return [
    Array.from({ length: n }, () => ID),
    [form],
    [undefined, form],
    [{ id: ID, userId: ID, reason: "A reason", body: "Some body text" }],
  ];
}

describe("Server Actions refuse a signed-out caller", () => {
  let db: TestDatabase;
  let tables: string[] = [];

  async function rowCounts(): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const table of tables) {
      const [row] = await db.prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM "${table}"`
      );
      counts[table] = Number(row!.n);
    }
    return counts;
  }

  beforeAll(async () => {
    db = await createTestDatabase();
    mocks.dbRef.current = db;
    await runSeed(db.prisma);
    tables = (
      await db.prisma.$queryRaw<{ tablename: string }[]>`
        SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
    ).map((t) => t.tablename);
  }, 60_000);

  afterAll(async () => {
    await db?.drop();
  });

  // Discovered from the file system, so an action in a file with any name is covered.
  const files = serverActionFiles(appRoot)
    .map((full) => path.relative(appRoot, full))
    .sort();

  it("finds the Server Action files", () => {
    expect(files.length).toBeGreaterThanOrEqual(20);
  });

  describe.each(files)("%s", (file) => {
    it("every exported action, any input: never ok, never a row written, never a server fault", async () => {
      const exported = (await import(
        /* @vite-ignore */ path.join(appRoot, file)
      )) as Record<string, unknown>;
      const actions = Object.entries(exported).filter(
        (entry): entry is [string, Action] => typeof entry[1] === "function"
      );
      expect(actions.length).toBeGreaterThan(0);

      const before = await rowCounts();
      for (const [name, action] of actions) {
        for (const args of argumentShapes(action.length)) {
          let outcome: unknown;
          try {
            outcome = await action(...args);
          } catch (thrown) {
            // A redirect to sign-in is a refusal too; anything else escaping an action is a bug.
            expect(String(thrown), `${name} threw`).toMatch(
              /NEXT_REDIRECT \/login/
            );
            continue;
          }
          expect(outcome, `${name}(${args.length} args)`).not.toMatchObject({
            ok: true,
          });
          // Bad input is the client's mistake: never a server fault in the logs and the error tracker.
          expect(
            outcome,
            `${name}(${args.length} args) is a server fault`
          ).not.toMatchObject({ error: { code: "INTERNAL_ERROR" } });
        }
      }
      expect(await rowCounts()).toEqual(before);
    });
  });
});
