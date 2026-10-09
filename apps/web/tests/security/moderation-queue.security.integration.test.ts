// Route-level, real PostgreSQL, real authorize; only the session (getActor) is doubled.
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

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
    transactionRunner: {
      run: (fn: (tx: unknown) => Promise<unknown>) => client().$transaction(fn),
    },
  };
});
vi.mock("@/modules/auth/infrastructure/actor", async () => {
  const { createPrismaGrantSource } =
    await import("@/modules/auth/infrastructure/prisma-grant-source");
  return {
    getActor: mocks.getActor,
    loadGrants: (userId: string, now: Date) =>
      createPrismaGrantSource(mocks.dbRef.current!.prisma).loadGrants(
        userId,
        now
      ),
  };
});
vi.mock("@/modules/auth/infrastructure/auth", () => ({ auth: {} }));
// The same-origin guard compares against BETTER_AUTH_URL when it is set (it is, in CI and in .env); pin it to
// this file's origin so the guard is tested, not the environment.
vi.mock("@/config/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/config/env")>();
  return {
    ...actual,
    env: { ...actual.env, BETTER_AUTH_URL: "https://alumni.example.test" },
  };
});

import type { Actor, AccountState } from "@/modules/auth";
import { resolveActor } from "@/modules/auth/application/resolve-actor";
import { createPrismaGrantSource } from "@/modules/auth/infrastructure/prisma-grant-source";

import { GET as listReportsRoute } from "@/app/api/v1/reports/route";
import { PATCH } from "@/app/api/v1/reports/[id]/route";
import { readReportedMessage } from "@/composition/messaging";

const ORIGIN = "https://alumni.example.test";

const jsonRequest = (
  url: string,
  method: string,
  body: unknown,
  origin: string | null = ORIGIN
) =>
  new Request(url, {
    method,
    headers: {
      "content-type": "application/json",
      ...(origin ? { origin } : {}),
    },
    body: JSON.stringify(body),
  });

describe("moderation queue (security)", () => {
  let db: TestDatabase;
  let grantorId: string;

  async function withRole(
    name: string,
    role: string,
    accountState: AccountState = "VERIFIED"
  ): Promise<Actor> {
    const user = await db.prisma.user.create({
      data: { name, email: `${name}@example.test`, accountState },
    });
    const { id: roleId } = await db.prisma.role.findUniqueOrThrow({
      where: { name: role },
    });
    await db.prisma.userRole.create({
      data: { userId: user.id, roleId, grantedBy: grantorId },
    });
    return resolveActor(
      {
        grantSource: createPrismaGrantSource(db.prisma),
        now: () => new Date(),
      },
      { userId: user.id, accountState },
      "req-moderation-queue-security"
    );
  }
  const as = (actor: Actor | null) => mocks.getActor.mockResolvedValue(actor);

  beforeAll(async () => {
    db = await createTestDatabase();
    mocks.dbRef.current = db;
    await runSeed(db.prisma);
    grantorId = (
      await db.prisma.user.create({
        data: {
          name: "Grantor",
          email: "grantor@example.test",
          accountState: "VERIFIED",
        },
      })
    ).id;
  });
  afterAll(async () => {
    await db.drop();
  });
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function reportedMessage(senderId: string, reporterId: string) {
    const [lo, hi] = [senderId, reporterId].sort();
    const conversation = await db.prisma.conversation.create({
      data: {
        createdById: senderId,
        isGroup: false,
        directPairKey: `${lo}:${hi}`,
      },
    });
    await db.prisma.conversationParticipant.createMany({
      data: [
        { conversationId: conversation.id, userId: senderId },
        { conversationId: conversation.id, userId: reporterId },
      ],
    });
    const message = await db.prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId,
        body: "PRIVATE-BODY",
        clientMessageId: crypto.randomUUID(),
      },
    });
    const report = await db.prisma.report.create({
      data: {
        reporterId,
        targetType: "MESSAGE",
        targetId: message.id,
        reason: "rude",
      },
    });
    return { messageId: message.id, reportId: report.id };
  }
  const patch = (reportId: string, body: unknown, origin?: string | null) =>
    PATCH(
      jsonRequest(
        `${ORIGIN}/api/v1/reports/${reportId}`,
        "PATCH",
        body,
        origin
      ),
      {
        params: Promise.resolve({ id: reportId }),
      }
    );

  it("GET /reports: a Moderator sees the MESSAGE report with a null preview and never its text", async () => {
    const mod = await withRole("mod1", "MODERATOR");
    const sender = await withRole("sender1", "ALUMNI");
    const reporter = await withRole("reporter1", "ALUMNI");
    const { reportId } = await reportedMessage(sender.userId, reporter.userId);
    as(mod);
    const res = await listReportsRoute(
      new Request(`${ORIGIN}/api/v1/reports?targetType=MESSAGE`)
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("PRIVATE-BODY");
    const body = JSON.parse(text) as {
      data: { id: string; preview: unknown }[];
    };
    expect(body.data.find((r) => r.id === reportId)?.preview).toBeNull();
  });

  it("GET /reports: an ALUMNI gets 404 and one authz.denied row; a bad filter is 400", async () => {
    const alumnus = await withRole("alum2", "ALUMNI");
    as(alumnus);
    expect(
      (await listReportsRoute(new Request(`${ORIGIN}/api/v1/reports`))).status
    ).toBe(404);
    await vi.waitFor(async () =>
      expect(
        await db.prisma.auditLog.count({
          where: { action: "authz.denied", actorId: alumnus.userId },
        })
      ).toBe(1)
    );
    as(await withRole("mod2", "MODERATOR"));
    expect(
      (
        await listReportsRoute(
          new Request(`${ORIGIN}/api/v1/reports?status=bogus`)
        )
      ).status
    ).toBe(400);
  });

  it("PATCH resolve on a MESSAGE report: 200, message hidden, audit rows with the reason", async () => {
    const mod = await withRole("mod3", "MODERATOR");
    const { messageId, reportId } = await reportedMessage(
      (await withRole("sender3", "ALUMNI")).userId,
      (await withRole("reporter3", "ALUMNI")).userId
    );
    as(mod);
    const res = await patch(reportId, {
      status: "RESOLVED",
      reason: "HARASSMENT",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: { id: reportId, status: "RESOLVED" },
    });
    expect(
      (await db.prisma.message.findUniqueOrThrow({ where: { id: messageId } }))
        .hiddenAt
    ).not.toBeNull();
    const resolved = await db.prisma.auditLog.findFirstOrThrow({
      where: { action: "report.resolved", targetId: reportId },
    });
    expect(resolved.metadata).toEqual({
      targetType: "MESSAGE",
      targetId: messageId,
      reason: "HARASSMENT",
    });
    expect(
      await db.prisma.auditLog.count({
        where: { action: "message.hidden", targetId: messageId },
      })
    ).toBe(1);
  });

  it("PATCH: the moderator who sent the message gets 403; an unknown body is 400; a replay is 409", async () => {
    const modSender = await withRole("mod4", "MODERATOR");
    const other = await withRole("mod5", "MODERATOR");
    const { reportId } = await reportedMessage(
      modSender.userId,
      (await withRole("reporter4", "ALUMNI")).userId
    );
    as(modSender);
    const self = await patch(reportId, {
      status: "DISMISSED",
      reason: "NO_VIOLATION",
    });
    expect(self.status).toBe(403);
    expect(
      ((await self.json()) as { error: { code: string } }).error.code
    ).toBe("SELF_REVIEW_FORBIDDEN");
    as(other);
    expect((await patch(reportId, { status: "RESOLVED" })).status).toBe(400);
    expect((await patch(reportId, { status: "OPEN" })).status).toBe(400);
    expect(
      (await patch(reportId, { status: "DISMISSED", reason: "NO_VIOLATION" }))
        .status
    ).toBe(200);
    expect(
      (await patch(reportId, { status: "RESOLVED", reason: "SPAM" })).status
    ).toBe(409);
  });

  it("PATCH: cross-origin is 403 and a malformed id is 404", async () => {
    const mod = await withRole("mod6", "MODERATOR");
    const { reportId } = await reportedMessage(
      (await withRole("sender6", "ALUMNI")).userId,
      (await withRole("reporter6", "ALUMNI")).userId
    );
    as(mod);
    expect(
      (
        await patch(
          reportId,
          { status: "UNDER_REVIEW" },
          "https://evil.example"
        )
      ).status
    ).toBe(403);
    const bad = await PATCH(
      jsonRequest(`${ORIGIN}/api/v1/reports/nope`, "PATCH", {
        status: "UNDER_REVIEW",
      }),
      {
        params: Promise.resolve({ id: "nope" }),
      }
    );
    expect(bad.status).toBe(404);
  });

  it("readReportedMessage: a Moderator reads with one audit row; an ALUMNI gets 404 and authz.denied", async () => {
    const mod = await withRole("mod7", "MODERATOR");
    const alumnus = await withRole("alum7", "ALUMNI");
    const { messageId, reportId } = await reportedMessage(
      (await withRole("sender7", "ALUMNI")).userId,
      (await withRole("reporter7", "ALUMNI")).userId
    );
    const view = await readReportedMessage({ actor: mod, reportId });
    expect(view.messages.map((m) => m.id)).toEqual([messageId]);
    expect(
      await db.prisma.auditLog.count({
        where: { action: "message.read_reported", actorId: mod.userId },
      })
    ).toBe(1);

    await expect(
      readReportedMessage({ actor: alumnus, reportId })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await vi.waitFor(async () => {
      const [row] = await db.prisma.auditLog.findMany({
        where: { action: "authz.denied", actorId: alumnus.userId },
      });
      expect(row?.metadata).toMatchObject({
        permission: "message.read_reported",
      });
    });
  });
});
