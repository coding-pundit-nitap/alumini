// The API authorization matrix, generated from api-inventory.ts. Real handlers and authorize(); only
// getActor is doubled, and an observer records refusals.
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Permission } from "@nitap/database/permissions";
import { ROLE_NAMES } from "@nitap/database/role-permissions";
import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

const ORIGIN = "https://alumni.example.test";

const mocks = vi.hoisted(() => ({
  dbRef: { current: null as TestDatabase | null },
  getActor: vi.fn(),
  events: [] as Array<{
    outcome: string;
    permission: string;
    reason?: string;
  }>,
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
  getActor: mocks.getActor,
  loadGrants: async () => [],
}));
vi.mock("@/modules/auth/infrastructure/auth", () => ({ auth: {} }));
vi.mock("@/modules/auth/infrastructure/authz-observer", () => ({
  authzObserver: {
    record: (event: { outcome: string; permission: string; reason?: string }) =>
      mocks.events.push(event),
  },
}));
vi.mock("@/config/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/config/env")>();
  return {
    ...actual,
    env: { ...actual.env, BETTER_AUTH_URL: "https://alumni.example.test" },
  };
});

import { readRoleMatrixFromDoc } from "../support/rbac-matrix-doc";
import type { AccountState, Actor } from "@/modules/auth";
import { resolveActor } from "@/modules/auth/application/resolve-actor";
import { createPrismaGrantSource } from "@/modules/auth/infrastructure/prisma-grant-source";

import { API_INVENTORY, type Entry, type Method } from "./api-inventory";

type Handler = (request: Request, context: unknown) => Promise<Response>;
const appRoot = path.resolve(import.meta.dirname, "../../src/app");
const loadRoute = (template: string) =>
  import(
    /* @vite-ignore */ path.join(appRoot, template, "route.ts")
  ) as Promise<Record<string, Handler>>;

const roleGrants = readRoleMatrixFromDoc();
const NON_VERIFIED: AccountState[] = [
  "PENDING",
  "REJECTED",
  "SUSPENDED",
  "DEACTIVATED",
];

/** A well-formed placeholder for every dynamic segment: unknown ids, and a real role name. */
function concretePath(template: string) {
  const params: Record<string, string> = {};
  const url = template.replace(/\[([^\]]+)\]/g, (_m, name: string) => {
    params[name] = name === "role" ? "ALUMNI" : crypto.randomUUID();
    return params[name]!;
  });
  return { url, params };
}

const sessionRoutes = Object.entries(API_INVENTORY).flatMap(
  ([template, methods]) =>
    Object.entries(methods)
      .filter(([, entry]) => entry.access.kind === "session")
      .map(([method, entry]) => ({
        template,
        method: method as Method,
        entry: entry as Entry & {
          access: { kind: "session"; anyOf: readonly Permission[] };
        },
      }))
);

const openRoutes = Object.entries(API_INVENTORY).flatMap(
  ([template, methods]) =>
    Object.entries(methods)
      .filter(([, entry]) =>
        ["visibility", "public"].includes(entry.access.kind)
      )
      .map(([method, entry]) => ({ template, method: method as Method, entry }))
);

async function call(
  template: string,
  method: Method,
  entry: Entry,
  actor: Actor | null,
  origin = ORIGIN
) {
  const handler = (await loadRoute(template))[method]!;
  const { url, params } = concretePath(template);
  const query = entry.sample?.query ? `?${entry.sample.query}` : "";
  mocks.getActor.mockResolvedValue(actor);
  mocks.events.length = 0;
  const response = await handler(
    new Request(`${ORIGIN}${url}${query}`, {
      method,
      headers: { origin, "content-type": "application/json" },
      ...(entry.mutates
        ? { body: JSON.stringify(entry.sample?.body ?? {}) }
        : {}),
    }),
    { params: Promise.resolve(params) }
  );
  // An allowed caller on the message stream gets an open SSE body; close it.
  await response.body?.cancel().catch(() => {});
  return { status: response.status, events: [...mocks.events] };
}

describe("whole-API authorization matrix", () => {
  let db: TestDatabase;
  let grantor: string;
  const verified = new Map<string, Actor>();
  const unverified = new Map<AccountState, Actor>();

  async function actorWith(role: string, state: AccountState): Promise<Actor> {
    const user = await db.prisma.user.create({
      data: {
        name: `${role} ${state}`,
        email:
          `${role}-${state}-${crypto.randomUUID()}@example.test`.toLowerCase(),
        accountState: state,
      },
    });
    const { id: roleId } = await db.prisma.role.findUniqueOrThrow({
      where: { name: role },
    });
    await db.prisma.userRole.create({
      data: { userId: user.id, roleId, grantedBy: grantor },
    });
    return resolveActor(
      {
        grantSource: createPrismaGrantSource(db.prisma),
        now: () => new Date(),
      },
      { userId: user.id, accountState: state },
      "req-api-matrix"
    );
  }

  beforeAll(async () => {
    db = await createTestDatabase();
    mocks.dbRef.current = db;
    await runSeed(db.prisma);
    grantor = (
      await db.prisma.user.create({
        data: {
          name: "Grantor",
          email: "grantor@example.test",
          accountState: "VERIFIED",
        },
      })
    ).id;
    for (const role of ROLE_NAMES)
      verified.set(role, await actorWith(role, "VERIFIED"));
    // The most privileged role in every other state: if it gets nothing, no one does.
    for (const state of NON_VERIFIED)
      unverified.set(state, await actorWith("SUPER_ADMIN", state));
  }, 60_000);

  afterAll(async () => {
    await db?.drop();
  });

  describe.each(openRoutes)(
    "$method $template (no session needed)",
    (route) => {
      it("answers anonymous callers and every role alike, never 401 or 5xx", async () => {
        const callers = [null, ...verified.values()];
        const statuses = new Set<number>();
        for (const actor of callers) {
          const { status } = await call(
            route.template,
            route.method,
            route.entry,
            actor
          );
          expect(status).not.toBe(401);
          expect(status).toBeLessThan(500);
          statuses.add(status);
        }
        // An unknown photo is the same 404 for everyone: existence never depends on who asks.
        expect(statuses.size).toBe(1);
      });
    }
  );

  describe.each(sessionRoutes)(
    "$method $template",
    ({ template, method, entry }) => {
      const anyOf = entry.access.anyOf;

      it("refuses a signed-out caller with 401", async () => {
        const { status, events } = await call(template, method, entry, null);
        expect(status).toBe(401);
        expect(events.map((e) => e.outcome)).toContain("unauthenticated");
      });

      it.each(NON_VERIFIED)(
        "gives a %s account nothing, whatever its roles",
        async (state) => {
          const { status } = await call(
            template,
            method,
            entry,
            unverified.get(state)!
          );
          expect([403, 404]).toContain(status);
        }
      );

      it.each(ROLE_NAMES)("%s", async (role) => {
        const actor = verified.get(role)!;
        const held = anyOf.filter((p) => roleGrants[role].has(p));
        const { status, events } = await call(template, method, entry, actor);
        expect(status, "never a server error").toBeLessThan(500);
        expect(status, "never anonymous").not.toBe(401);

        if (held.length === 0) {
          // Lacking every permission: refused, and by authorize(), not by a lookup that happened to miss.
          expect([403, 404]).toContain(status);
          expect(
            events.some(
              (e) => e.outcome === "denied" && e.reason === "NO_GRANT"
            ),
            "a NO_GRANT denial was recorded"
          ).toBe(true);
        } else {
          // Holding one: authorize() never refuses it for want of a grant (ownership may still refuse).
          const refusedHeld = events.filter(
            (e) =>
              e.outcome === "denied" &&
              e.reason === "NO_GRANT" &&
              held.includes(e.permission as Permission)
          );
          expect(refusedHeld).toEqual([]);
        }
      });

      if (entry.mutates) {
        it("refuses a foreign Origin with 403 before anything else", async () => {
          const { status, events } = await call(
            template,
            method,
            entry,
            verified.get("SUPER_ADMIN")!,
            "https://evil.example"
          );
          expect(status).toBe(403);
          expect(events).toEqual([]);
        });
      }
    }
  );
});
