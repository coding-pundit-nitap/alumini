import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createOutboxWriter } from "@nitap/database/outbox";
import { runSeed } from "@nitap/database/seed";

import { createTransactionRunner } from "@/infrastructure/database/transaction-runner";
import { getRedis } from "@/infrastructure/redis/client";
import { redisRateLimitStorage } from "@/infrastructure/redis/rate-limit-storage";
import { createApplyEmailVerification } from "@/modules/auth/application/apply-email-verification";
import { createAuthEmailSender } from "@/modules/auth/application/auth-emails";
import { createProvisionMember } from "@/modules/auth/application/provision-member";
import { createAuth } from "@/modules/auth/infrastructure/auth-factory";
import { createEmailOutbox } from "@/modules/auth/infrastructure/email-outbox";
import { createPrismaMemberStore } from "@/modules/auth/infrastructure/prisma-member-store";

import type { TestDatabase } from "../../support/test-database";
import { createTestDatabase } from "../../support/test-database";

const PASSWORD = "correct-horse-battery";
const BASE = "http://localhost:3000";

describe("authentication security (real PostgreSQL and Redis)", () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
  });

  afterEach(async () => {
    await db.drop();
    const redis = await getRedis();
    const keys = await redis.keys("rl:auth:*");
    if (keys.length > 0) await redis.del(...keys);
  });

  function makeAuth(options: { rateLimited?: boolean } = {}) {
    const runner = createTransactionRunner(db.prisma);
    const store = createPrismaMemberStore(runner);
    return createAuth({
      prisma: db.prisma,
      baseURL: BASE,
      secret: "test-secret-test-secret-test-secret-0000",
      nextCookies: false,
      authEmails: createAuthEmailSender({
        outbox: createEmailOutbox({ runner, writer: createOutboxWriter() }),
      }),
      provisionMember: createProvisionMember({ store }),
      applyEmailVerification: createApplyEmailVerification({
        store,
        policy: () => new Map(),
      }),
      ...(options.rateLimited
        ? { rateLimit: { enabled: true, storage: redisRateLimitStorage } }
        : {}),
    });
  }

  /** A confirmed account in the given state, created through the real sign-up path. */
  async function member(
    auth: ReturnType<typeof makeAuth>,
    email: string,
    accountState:
      "PENDING" | "VERIFIED" | "SUSPENDED" | "DEACTIVATED" = "PENDING"
  ) {
    await auth.api.signUpEmail({
      body: { name: "Asha Rao", email, password: PASSWORD },
    });
    await db.prisma.user.update({
      where: { email },
      data: { emailVerified: true, accountState },
    });
  }

  async function failure(run: () => Promise<unknown>) {
    try {
      await run();
      return null;
    } catch (error) {
      const e = error as {
        status?: unknown;
        body?: { code?: string; message?: string };
      };
      return { status: e.status, code: e.body?.code, message: e.body?.message };
    }
  }

  const signIn = (
    auth: ReturnType<typeof makeAuth>,
    email: string,
    password: string
  ) => auth.api.signInEmail({ body: { email, password } });

  it("answers an unknown user and a wrong password identically", async () => {
    const auth = makeAuth();
    await member(auth, "asha@example.test");

    const unknown = await failure(() =>
      signIn(auth, "nobody@example.test", PASSWORD)
    );
    const wrong = await failure(() =>
      signIn(auth, "asha@example.test", "not-the-password")
    );

    expect(unknown).not.toBeNull();
    expect(unknown).toEqual(wrong);
    expect(unknown?.code).toBe("INVALID_EMAIL_OR_PASSWORD");
  });

  it("does not let a DEACTIVATED account sign in", async () => {
    const auth = makeAuth();
    await member(auth, "asha@example.test", "DEACTIVATED");

    const result = await failure(() =>
      signIn(auth, "asha@example.test", PASSWORD)
    );

    expect(result?.code).toBe("ACCOUNT_DEACTIVATED");
    expect(await db.prisma.session.count()).toBe(0);
  });

  it.each(["PENDING", "SUSPENDED"] as const)(
    "lets a %s account sign in so it can see its status",
    async (state) => {
      const auth = makeAuth();
      await member(auth, "asha@example.test", state);

      const session = await signIn(auth, "asha@example.test", PASSWORD);

      expect(session.user.email).toBe("asha@example.test");
    }
  );

  it("stops a session working on the very next request once its rows are deleted", async () => {
    const auth = makeAuth();
    await member(auth, "asha@example.test", "VERIFIED");
    const signedIn = await auth.api.signInEmail({
      body: { email: "asha@example.test", password: PASSWORD },
      returnHeaders: true,
    });
    const cookie = signedIn.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const headers = new Headers({ cookie });

    expect((await auth.api.getSession({ headers }))?.user.email).toBe(
      "asha@example.test"
    );

    await db.prisma.session.deleteMany();

    expect(await auth.api.getSession({ headers })).toBeNull();
  });

  // The limiter runs before the endpoint validates anything, so a throwaway body is enough.
  it.each([
    ["/sign-in/email", 10],
    ["/sign-up/email", 5],
    ["/request-password-reset", 5],
    ["/send-verification-email", 5],
  ])("rate-limits %s per client after %i attempts", async (path, max) => {
    const auth = makeAuth({ rateLimited: true });
    const ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
    const attempt = () =>
      auth.handler(
        new Request(`${BASE}/api/auth${path}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: BASE,
            "x-forwarded-for": ip,
          },
          body: JSON.stringify({
            email: "nobody@example.test",
            password: PASSWORD,
          }),
        })
      );

    const statuses: number[] = [];
    for (let i = 0; i <= max; i += 1) statuses.push((await attempt()).status);

    expect(statuses.slice(0, max).every((s) => s !== 429)).toBe(true);
    expect(statuses[max]).toBe(429);
  });

  it("rejects a state-changing request from a foreign origin", async () => {
    const auth = makeAuth();

    const response = await auth.handler(
      new Request(`${BASE}/api/auth/sign-in/email`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://evil.example",
          cookie: "better-auth.session_token=anything",
        },
        body: JSON.stringify({ email: "a@example.test", password: PASSWORD }),
      })
    );

    expect(response.status).toBe(403);
  });
});
