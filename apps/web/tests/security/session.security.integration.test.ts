// Session security and the Better Auth surface (strategy §10.1 "Session security", spec 16 16C), through
// Better Auth's real handler on a test database. Every /api/auth endpoint is reachable by any client, so
// each one that could change identity, sessions or account state is tested here, not assumed.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createOutboxWriter } from "@nitap/database/outbox";
import { runSeed } from "@nitap/database/seed";

import { createTransactionRunner } from "@/infrastructure/database/transaction-runner";
import { createApplyEmailVerification } from "@/modules/auth/application/apply-email-verification";
import { createAuthEmailSender } from "@/modules/auth/application/auth-emails";
import { createProvisionMember } from "@/modules/auth/application/provision-member";
import {
  createAuth,
  DISABLED_AUTH_PATHS,
  ENABLED_AUTH_PATHS,
} from "@/modules/auth/infrastructure/auth-factory";
import { createEmailOutbox } from "@/modules/auth/infrastructure/email-outbox";
import { createPrismaMemberStore } from "@/modules/auth/infrastructure/prisma-member-store";

import type { TestDatabase } from "../support/test-database";
import { createTestDatabase } from "../support/test-database";

const PASSWORD = "correct-horse-battery";
const NEW_PASSWORD = "another-horse-battery";

describe("session security (real Better Auth, real PostgreSQL)", () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
  });

  afterEach(async () => {
    await db.drop();
  });

  function makeAuth(base = "http://localhost:3000") {
    const runner = createTransactionRunner(db.prisma);
    const store = createPrismaMemberStore(runner);
    const auth = createAuth({
      prisma: db.prisma,
      baseURL: base,
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
    });
    const post = (path: string, body: unknown, cookie = "") =>
      auth.handler(
        new Request(`${base}/api/auth${path}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: base,
            ...(cookie ? { cookie } : {}),
          },
          body: JSON.stringify(body),
        })
      );
    const get = (path: string, cookie = "") =>
      auth.handler(
        new Request(`${base}/api/auth${path}`, {
          headers: { origin: base, ...(cookie ? { cookie } : {}) },
        })
      );
    return { auth, post, get, base };
  }

  type Harness = ReturnType<typeof makeAuth>;

  /** A confirmed VERIFIED account, created through the real sign-up path. */
  async function member(h: Harness, email: string) {
    await h.auth.api.signUpEmail({
      body: { name: "Asha Rao", email, password: PASSWORD },
    });
    await db.prisma.user.update({
      where: { email },
      data: { emailVerified: true, accountState: "VERIFIED" },
    });
    return (await db.prisma.user.findUniqueOrThrow({ where: { email } })).id;
  }

  const cookieFrom = (response: Response) =>
    response.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .filter((c) => !c.endsWith("="))
      .join("; ");

  async function signIn(h: Harness, email: string, cookie = "") {
    const response = await h.post(
      "/sign-in/email",
      { email, password: PASSWORD },
      cookie
    );
    expect(response.status).toBe(200);
    return { response, cookie: cookieFrom(response) };
  }

  const whoIs = async (h: Harness, cookie: string) =>
    (await h.auth.api.getSession({ headers: new Headers({ cookie }) }))?.user
      .email ?? null;

  describe("cookie flags", () => {
    it("over HTTPS the session cookie is __Secure-, Secure, HttpOnly, SameSite=Lax, Path=/, 30 days", async () => {
      const h = makeAuth("https://alumni.example.test");
      await member(h, "asha@example.test");
      const { response } = await signIn(h, "asha@example.test");
      const token = response.headers
        .getSetCookie()
        .find((c) => c.includes("session_token="))!;
      expect(token).toMatch(/^__Secure-better-auth\.session_token=/);
      expect(token).toMatch(/;\s*Secure/i);
      expect(token).toMatch(/;\s*HttpOnly/i);
      expect(token).toMatch(/;\s*SameSite=Lax/i);
      expect(token).toMatch(/;\s*Path=\//i);
      const maxAge = Number(/Max-Age=(\d+)/i.exec(token)?.[1]);
      expect(maxAge).toBe(60 * 60 * 24 * 30);
    });

    it("no session cookie is readable by page scripts", async () => {
      const h = makeAuth("https://alumni.example.test");
      await member(h, "asha@example.test");
      const { response } = await signIn(h, "asha@example.test");
      for (const cookie of response.headers.getSetCookie()) {
        expect(cookie, cookie.split("=")[0]).toMatch(/;\s*HttpOnly/i);
      }
    });
  });

  describe("fixation", () => {
    it("ignores a session cookie the attacker planted: sign-in issues a fresh token", async () => {
      const h = makeAuth();
      await member(h, "asha@example.test");
      const planted = "better-auth.session_token=attacker-chosen-value.sig";
      const { cookie } = await signIn(h, "asha@example.test", planted);
      expect(cookie).not.toContain("attacker-chosen-value");
      expect(await whoIs(h, planted)).toBeNull();
      expect(await whoIs(h, cookie)).toBe("asha@example.test");
    });

    it("a victim signing in over the attacker's own session does not hand it to the attacker", async () => {
      const h = makeAuth();
      await member(h, "attacker@example.test");
      await member(h, "victim@example.test");
      const attacker = (await signIn(h, "attacker@example.test")).cookie;
      const victim = (await signIn(h, "victim@example.test", attacker)).cookie;
      expect(victim).not.toBe(attacker);
      expect(await whoIs(h, attacker)).toBe("attacker@example.test");
      expect(await whoIs(h, victim)).toBe("victim@example.test");
    });
  });

  describe("expiry and tampering", () => {
    it("a session past its expiry is refused", async () => {
      const h = makeAuth();
      await member(h, "asha@example.test");
      const { cookie } = await signIn(h, "asha@example.test");
      await db.prisma.session.updateMany({
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      expect(await whoIs(h, cookie)).toBeNull();
    });

    it("a new session expires 30 days out (absolute lifetime)", async () => {
      const h = makeAuth();
      await member(h, "asha@example.test");
      await signIn(h, "asha@example.test");
      const { expiresAt } = await db.prisma.session.findFirstOrThrow();
      const days = (expiresAt.getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(29.9);
      expect(days).toBeLessThanOrEqual(30);
    });

    it("a token with a forged signature is refused", async () => {
      const h = makeAuth();
      await member(h, "asha@example.test");
      const { cookie } = await signIn(h, "asha@example.test");
      const [name, value] = cookie.split("=");
      const [token] = decodeURIComponent(value!).split(".");
      const forged = `${name}=${encodeURIComponent(`${token}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=`)}`;
      expect(await whoIs(h, forged)).toBeNull();
    });
  });

  describe("revocation", () => {
    it("sign-out ends the session for that cookie", async () => {
      const h = makeAuth();
      await member(h, "asha@example.test");
      const { cookie } = await signIn(h, "asha@example.test");
      expect((await h.post("/sign-out", {}, cookie)).status).toBe(200);
      expect(await whoIs(h, cookie)).toBeNull();
    });

    it("there is no password change that could leave a stolen session alive (change-password is closed)", async () => {
      const h = makeAuth();
      await member(h, "asha@example.test");
      const stolen = (await signIn(h, "asha@example.test")).cookie;
      const owner = (await signIn(h, "asha@example.test")).cookie;
      const response = await h.post(
        "/change-password",
        {
          currentPassword: PASSWORD,
          newPassword: NEW_PASSWORD,
          revokeOtherSessions: false,
        },
        owner
      );
      expect(response.status).toBe(404);
      expect(await whoIs(h, stolen)).toBe("asha@example.test");
      // The way to evict every session is a reset, which always revokes (next test).
    });

    it("a password reset ends every session", async () => {
      const h = makeAuth();
      await member(h, "asha@example.test");
      const { cookie } = await signIn(h, "asha@example.test");
      await h.post("/request-password-reset", {
        email: "asha@example.test",
        redirectTo: "/reset-password",
      });
      const { token } = await db.prisma.verification
        .findFirstOrThrow({
          where: { identifier: { startsWith: "reset-password:" } },
        })
        .then((row) => ({ token: row.identifier.split(":")[1]! }));
      expect(
        (await h.post("/reset-password", { token, newPassword: NEW_PASSWORD }))
          .status
      ).toBe(200);
      expect(await whoIs(h, cookie)).toBeNull();
    });

    it("one member cannot revoke another member's session", async () => {
      const h = makeAuth();
      await member(h, "asha@example.test");
      await member(h, "ravi@example.test");
      const asha = (await signIn(h, "asha@example.test")).cookie;
      const ravi = (await signIn(h, "ravi@example.test")).cookie;
      const raviToken = (
        await db.prisma.session.findFirstOrThrow({
          where: { user: { email: "ravi@example.test" } },
        })
      ).token;
      await h.post("/revoke-session", { token: raviToken }, asha);
      expect(await whoIs(h, ravi)).toBe("ravi@example.test");
    });
  });

  describe("only the Better Auth endpoints the app uses are open (SD-11)", () => {
    it("every endpoint Better Auth registers is classified as enabled or disabled", () => {
      const { auth } = makeAuth();
      const registered = new Set(
        Object.values(auth.api as Record<string, { path?: string }>)
          .map((endpoint) => endpoint.path)
          .filter((path): path is string => typeof path === "string")
      );
      const classified = new Set<string>([
        ...ENABLED_AUTH_PATHS,
        ...DISABLED_AUTH_PATHS,
      ]);
      expect([...registered].filter((p) => !classified.has(p))).toEqual([]);
      for (const path of ENABLED_AUTH_PATHS)
        expect(registered.has(path), path).toBe(true);
    });

    it.each(DISABLED_AUTH_PATHS.map((p) => [p]))(
      "%s answers 404, signed in or not",
      async (template) => {
        const h = makeAuth();
        await member(h, "asha@example.test");
        const { cookie } = await signIn(h, "asha@example.test");
        const path = template.replace(":id", "google");
        for (const send of [
          () => h.post(path, {}, cookie),
          () => h.get(path, cookie),
        ]) {
          const response = await send();
          if (template === "/callback/:id") {
            // disabledPaths matches concrete paths, so the OAuth callback still answers; with no provider
            // configured it only redirects on this origin, and never sets a session.
            expect(response.status).toBe(302);
            expect(new URL(response.headers.get("location")!).origin).toBe(
              h.base
            );
            expect(response.headers.getSetCookie().join()).not.toMatch(
              /session_token=[^;]/
            );
          } else {
            expect(response.status).toBe(404);
          }
        }
      }
    );
  });

  describe("endpoints that would bypass the account rules are closed", () => {
    it("update-user cannot set account state, email, verification or deactivation", async () => {
      const h = makeAuth();
      const id = await member(h, "asha@example.test");
      await db.prisma.user.update({
        where: { id },
        data: { accountState: "SUSPENDED" },
      });
      const { cookie } = await signIn(h, "asha@example.test");
      await h.post(
        "/update-user",
        {
          name: "Renamed",
          accountState: "VERIFIED",
          email: "other@example.test",
          emailVerified: false,
          deactivatedAt: null,
        },
        cookie
      );
      const user = await db.prisma.user.findUniqueOrThrow({ where: { id } });
      expect(user.accountState).toBe("SUSPENDED");
      expect(user.email).toBe("asha@example.test");
      expect(user.emailVerified).toBe(true);
    });

    it("change-email is refused: an address change would skip the institutional policy", async () => {
      const h = makeAuth();
      const id = await member(h, "asha@example.test");
      const { cookie } = await signIn(h, "asha@example.test");
      const response = await h.post(
        "/change-email",
        { newEmail: "asha@nitap.ac.in" },
        cookie
      );
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(
        (await db.prisma.user.findUniqueOrThrow({ where: { id } })).email
      ).toBe("asha@example.test");
    });

    it("delete-user is refused: accounts are deactivated, never hard-deleted by their owner", async () => {
      const h = makeAuth();
      const id = await member(h, "asha@example.test");
      const { cookie } = await signIn(h, "asha@example.test");
      const response = await h.post(
        "/delete-user",
        { password: PASSWORD },
        cookie
      );
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(await db.prisma.user.count({ where: { id } })).toBe(1);
    });

    it("update-session cannot move a session to another user or extend it", async () => {
      const h = makeAuth();
      await member(h, "asha@example.test");
      const otherId = await member(h, "ravi@example.test");
      const { cookie } = await signIn(h, "asha@example.test");
      const before = await db.prisma.session.findFirstOrThrow({
        where: { user: { email: "asha@example.test" } },
      });
      await h.post(
        "/update-session",
        { userId: otherId, expiresAt: "2099-01-01T00:00:00Z" },
        cookie
      );
      const after = await db.prisma.session.findUniqueOrThrow({
        where: { id: before.id },
      });
      expect(after.userId).toBe(before.userId);
      expect(after.expiresAt).toEqual(before.expiresAt);
    });

    it.each(["/sign-in/social", "/link-social"])(
      "%s is refused: no social provider is configured",
      async (path) => {
        const h = makeAuth();
        await member(h, "asha@example.test");
        const { cookie } = await signIn(h, "asha@example.test");
        const response = await h.post(
          path,
          { provider: "google", callbackURL: "/" },
          cookie
        );
        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(await db.prisma.account.count()).toBe(1);
      }
    );
  });

  describe("passwords at rest (NFR-SEC-001)", () => {
    it("are stored as salted hashes, never as the password", async () => {
      const h = makeAuth();
      await member(h, "asha@example.test");
      await member(h, "ravi@example.test");
      const hashes = (await db.prisma.account.findMany()).map(
        (a) => a.password
      );
      expect(hashes).toHaveLength(2);
      for (const hash of hashes) {
        expect(hash).not.toContain(PASSWORD);
        expect(hash!.length).toBeGreaterThan(60);
      }
      expect(hashes[0]).not.toBe(hashes[1]);
    });
  });
});
