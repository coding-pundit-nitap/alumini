// Input handling at the API boundary. Property-based: every
// JSON route gets arbitrary bodies, every list route arbitrary query strings and an injection corpus, every
// dynamic segment arbitrary text. The contract is the boundary's, not the business rules': an answer from
// the error catalogue, never a 5xx, never a hang. Runs as a VERIFIED SUPER_ADMIN so input travels as deep
// into the use cases as it can.
import path from "node:path";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

const mocks = vi.hoisted(() => ({
  dbRef: { current: null as TestDatabase | null },
  getActor: vi.fn(),
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
vi.mock("@/config/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/config/env")>();
  return {
    ...actual,
    env: { ...actual.env, BETTER_AUTH_URL: "https://alumni.example.test" },
  };
});

import { ERROR_CATALOG } from "@/lib/errors";
import { resolveActor } from "@/modules/auth/application/resolve-actor";
import { createPrismaGrantSource } from "@/modules/auth/infrastructure/prisma-grant-source";

import { MAX_JSON_BODY_BYTES } from "@/app/api/v1/_lib/request";

import { API_INVENTORY, type Method } from "./api-inventory";

const ORIGIN = "https://alumni.example.test";
const RUNS = Number(process.env.FUZZ_RUNS ?? 20);
const appRoot = path.resolve(import.meta.dirname, "../../src/app");

type Handler = (request: Request, context: unknown) => Promise<Response>;
const loadRoute = (template: string) =>
  import(
    /* @vite-ignore */ path.join(appRoot, template, "route.ts")
  ) as Promise<Record<string, Handler>>;

const apiRoutes = Object.entries(API_INVENTORY)
  .filter(([template]) => template.startsWith("/api/v1/"))
  .flatMap(([template, methods]) =>
    Object.entries(methods).map(([method, entry]) => ({
      template,
      method: method as Method,
      mutates: entry.mutates,
    }))
  )
  // The message stream holds its response open; it has no body or query to fuzz.
  .filter((r) => r.template !== "/api/v1/messages/stream");

const jsonRoutes = apiRoutes.filter((r) => r.mutates);
const listRoutes = apiRoutes.filter((r) => !r.mutates);
const idRoutes = apiRoutes.filter((r) => r.template.includes("["));

const fill = (template: string, value: (name: string) => string) => {
  const params: Record<string, string> = {};
  const url = template.replace(/\[([^\]]+)\]/g, (_m, name: string) => {
    params[name] = value(name);
    return encodeURIComponent(params[name]!);
  });
  return { url, params };
};
const placeholder = (name: string) =>
  name === "role" ? "ALUMNI" : crypto.randomUUID();

/** Classifies a response against the boundary contract; returns a reason when it breaks it. */
async function breach(response: Response): Promise<string | null> {
  if (response.status >= 500) return `server error ${response.status}`;
  if (response.status < 400) {
    await response.body?.cancel().catch(() => {});
    return null;
  }
  const text = await response.text();
  if (text === "") return null; // bare 404s from the photo and upload routes
  let body: { error?: { code?: string }; requestId?: string };
  try {
    body = JSON.parse(text);
  } catch {
    return `non-JSON error body: ${text.slice(0, 80)}`;
  }
  const code = body.error?.code;
  if (!code) return `no error code: ${text.slice(0, 80)}`;
  // A catalogue code (or a module's own, which still maps to a client status).
  if (ERROR_CATALOG[code] && ERROR_CATALOG[code]!.status !== response.status)
    return `${code} with status ${response.status}`;
  if (/at\s+\S+\s+\(|prisma|SELECT\s|stack/i.test(text))
    return `internals in the body: ${text.slice(0, 120)}`;
  return null;
}

async function send(
  route: { template: string; method: Method },
  init: { body?: string; query?: string; segment?: (name: string) => string }
) {
  const { url, params } = fill(route.template, init.segment ?? placeholder);
  const handler = (await loadRoute(route.template))[route.method]!;
  return handler(
    new Request(`${ORIGIN}${url}${init.query ? `?${init.query}` : ""}`, {
      method: route.method,
      headers: { origin: ORIGIN, "content-type": "application/json" },
      ...(init.body !== undefined ? { body: init.body } : {}),
    }),
    { params: Promise.resolve(params) }
  );
}

const SQL_AND_FRIENDS = [
  "' OR '1'='1",
  "' OR 1=1 --",
  '\'; DROP TABLE "user"; --',
  '" OR ""="',
  "1; SELECT pg_sleep(5)",
  '\') UNION SELECT email, null FROM "user" --',
  "%' AND 1=0 UNION SELECT 1 --",
  "\\x00",
  "\u0000",
  "${7*7}",
  "{{7*7}}",
  "../../../../etc/passwd",
  "<script>alert(1)</script>",
  "' || (SELECT current_user) || '",
  "%%%%%%%%%%",
  "_".repeat(200),
  "é".repeat(500),
  "\uD800",
];

describe("API boundary under arbitrary input", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase();
    mocks.dbRef.current = db;
    await runSeed(db.prisma);
    const grantor = await db.prisma.user.create({
      data: { name: "G", email: "g@example.test", accountState: "VERIFIED" },
    });
    const user = await db.prisma.user.create({
      data: {
        name: "Fuzz Admin",
        email: "fuzz@example.test",
        accountState: "VERIFIED",
      },
    });
    await db.prisma.profile.create({
      data: { userId: user.id, fullName: "Fuzz Admin" },
    });
    for (const name of ["SUPER_ADMIN", "ALUMNI"]) {
      const { id: roleId } = await db.prisma.role.findUniqueOrThrow({
        where: { name },
      });
      await db.prisma.userRole.create({
        data: { userId: user.id, roleId, grantedBy: grantor.id },
      });
    }
    // A few real profiles, so a search that leaked through would have rows to return.
    for (const fullName of ["Asha Rao", "Ravi Kumar", "Meera Das"]) {
      const member = await db.prisma.user.create({
        data: {
          name: fullName,
          email: `${fullName.split(" ")[0]!.toLowerCase()}@example.test`,
          accountState: "VERIFIED",
        },
      });
      await db.prisma.profile.create({
        data: { userId: member.id, fullName, visibility: "MEMBERS_ONLY" },
      });
    }
    mocks.getActor.mockResolvedValue(
      await resolveActor(
        {
          grantSource: createPrismaGrantSource(db.prisma),
          now: () => new Date(),
        },
        { userId: user.id, accountState: "VERIFIED" },
        "req-fuzz"
      )
    );
  }, 60_000);

  afterAll(async () => {
    await db?.drop();
  });

  describe.each(jsonRoutes)("$method $template", (route) => {
    it("arbitrary JSON bodies get a client answer, never a 5xx", async () => {
      await fc.assert(
        fc.asyncProperty(fc.jsonValue({ maxDepth: 6 }), async (value) => {
          const reason = await breach(
            await send(route, { body: JSON.stringify(value) })
          );
          expect(reason).toBeNull();
        }),
        { numRuns: RUNS }
      );
    });

    it("hostile shapes: deep nesting, huge strings, prototype keys, non-JSON, oversize", async () => {
      const deep = "[".repeat(20_000) + "]".repeat(20_000);
      const bodies = [
        deep,
        JSON.stringify({ a: "x".repeat(60_000) }),
        '{"__proto__":{"admin":true},"constructor":{"prototype":{"x":1}}}',
        "not json",
        "",
        "null",
        "[]",
        JSON.stringify("x".repeat(MAX_JSON_BODY_BYTES + 1)),
        // Text PostgreSQL cannot store, in every field name the write routes use.
        JSON.stringify(
          Object.fromEntries(
            [
              "title",
              "body",
              "reason",
              "note",
              "message",
              "name",
              "description",
              "company",
              "location",
            ].map((k) => [k, "a\u0000b"])
          )
        ),
      ];
      for (const body of bodies) {
        const response = await send(route, { body });
        expect(await breach(response), body.slice(0, 40)).toBeNull();
      }
      expect(({} as Record<string, unknown>).admin).toBeUndefined();
    });
  });

  describe.each(listRoutes)("$method $template", (route) => {
    it("arbitrary query strings get a client answer, never a 5xx", async () => {
      const key = fc.constantFrom(
        "q",
        "cursor",
        "limit",
        "state",
        "scope",
        "role",
        "department",
        "year",
        "mine",
        "direction",
        "includeCancelled",
        "status",
        "action",
        "actorId"
      );
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.tuple(key, fc.string({ unit: "binary", maxLength: 300 })),
            {
              maxLength: 6,
            }
          ),
          async (pairs) => {
            const query = new URLSearchParams(pairs).toString();
            expect(await breach(await send(route, { query }))).toBeNull();
          }
        ),
        { numRuns: RUNS }
      );
    });

    it("the injection corpus in every common parameter gets a client answer", async () => {
      for (const payload of SQL_AND_FRIENDS) {
        for (const key of ["q", "cursor", "limit", "state", "department"]) {
          const query = new URLSearchParams({ [key]: payload }).toString();
          expect(
            await breach(await send(route, { query })),
            `${key}=${payload.slice(0, 30)}`
          ).toBeNull();
        }
      }
      // A query string far past anything a form produces.
      const huge = new URLSearchParams({ q: "a".repeat(16_000) }).toString();
      expect(await breach(await send(route, { query: huge }))).toBeNull();
    });
  });

  describe.each(idRoutes)("$method $template", (route) => {
    it("arbitrary text in a path segment is a 404 or a client answer, never a 5xx", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ unit: "binary", maxLength: 80 }),
          async (raw) => {
            const response = await send(route, {
              segment: (name) => (name === "role" ? raw : raw),
              ...(route.mutates ? { body: "{}" } : {}),
            });
            expect(await breach(response)).toBeNull();
          }
        ),
        { numRuns: RUNS }
      );
    });
  });

  it("search is parameterised: injection text matches no one and leaks no one", async () => {
    // A fresh member: the fuzzing above has spent the first one's search allowance (60 a minute).
    const searcher = await db.prisma.user.create({
      data: {
        name: "Searcher",
        email: "searcher@example.test",
        accountState: "VERIFIED",
      },
    });
    await db.prisma.profile.create({
      data: { userId: searcher.id, fullName: "Searcher" },
    });
    const { id: roleId } = await db.prisma.role.findUniqueOrThrow({
      where: { name: "ALUMNI" },
    });
    await db.prisma.userRole.create({
      data: { userId: searcher.id, roleId, grantedBy: searcher.id },
    });
    mocks.getActor.mockResolvedValue(
      await resolveActor(
        {
          grantSource: createPrismaGrantSource(db.prisma),
          now: () => new Date(),
        },
        { userId: searcher.id, accountState: "VERIFIED" },
        "req-fuzz-search"
      )
    );
    const route = { template: "/api/v1/alumni", method: "GET" as const };
    const real = await (await send(route, { query: "q=Asha" })).json();
    expect(real.data.length).toBeGreaterThan(0);
    for (const payload of ["' OR '1'='1", "' OR 1=1 --", "%' OR '%'='"]) {
      const response = await send(route, {
        query: new URLSearchParams({ q: payload }).toString(),
      });
      expect([200, 400]).toContain(response.status);
      if (response.status === 200) {
        const body = await response.json();
        expect(body.data, payload).toEqual([]);
      }
    }
  });
});
