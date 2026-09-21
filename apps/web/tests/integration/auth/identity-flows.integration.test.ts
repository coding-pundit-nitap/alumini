import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createOutboxWriter } from "@nitap/database/outbox";
import { runSeed } from "@nitap/database/seed";

import { createTransactionRunner } from "@/infrastructure/database/transaction-runner";
import { createApplyEmailVerification } from "@/modules/auth/application/apply-email-verification";
import { createAuthEmailSender } from "@/modules/auth/application/auth-emails";
import {
  createProvisionMember,
  type ProvisionMember,
} from "@/modules/auth/application/provision-member";
import type { EmailPolicy } from "@/modules/auth/domain/email-policy";
import { createAuth } from "@/modules/auth/infrastructure/auth-factory";
import { createEmailOutbox } from "@/modules/auth/infrastructure/email-outbox";
import { createPrismaMemberStore } from "@/modules/auth/infrastructure/prisma-member-store";

import type { TestDatabase } from "../../support/test-database";
import { createTestDatabase } from "../../support/test-database";

const policy: EmailPolicy = new Map([
  ["inst.test", { role: "STUDENT", autoVerify: true }],
  ["staff.inst.test", { role: "STAFF", autoVerify: false }],
]);
const PASSWORD = "correct-horse-battery";

type EmailPayload = {
  template: string;
  to: string;
  params: { verificationUrl: string; resetUrl: string };
};

describe("identity flows through Better Auth (real PostgreSQL)", () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
  });

  afterEach(async () => {
    await db.drop();
  });

  function makeAuth(overrides: { provisionMember?: ProvisionMember } = {}) {
    const runner = createTransactionRunner(db.prisma);
    const store = createPrismaMemberStore(runner);
    return createAuth({
      prisma: db.prisma,
      baseURL: "http://localhost:3000",
      secret: "test-secret-test-secret-test-secret-0000",
      nextCookies: false,
      authEmails: createAuthEmailSender({
        outbox: createEmailOutbox({ runner, writer: createOutboxWriter() }),
      }),
      provisionMember:
        overrides.provisionMember ?? createProvisionMember({ store }),
      applyEmailVerification: createApplyEmailVerification({
        store,
        policy: () => policy,
      }),
    });
  }

  async function emails(template: string) {
    const rows = await db.prisma.outboxEvent.findMany();
    return rows
      .map((row) => row.payload as EmailPayload)
      .filter((payload) => payload.template === template);
  }

  const tokenFrom = (url: string) => new URL(url).searchParams.get("token")!;
  const lastSegment = (url: string) =>
    new URL(url).pathname.split("/").filter(Boolean).at(-1)!;

  async function signUp(auth: ReturnType<typeof makeAuth>, email: string) {
    await auth.api.signUpEmail({
      body: { name: "Asha Rao", email, password: PASSWORD },
    });
  }

  it("sign-up creates a PENDING user, its profile and one verification email, with no role", async () => {
    const auth = makeAuth();
    await signUp(auth, "asha@inst.test");

    const user = await db.prisma.user.findUniqueOrThrow({
      where: { email: "asha@inst.test" },
    });
    expect(user.accountState).toBe("PENDING");
    expect(user.emailVerified).toBe(false);
    expect(
      await db.prisma.profile.findUnique({ where: { userId: user.id } })
    ).toMatchObject({ fullName: "Asha Rao" });
    expect(await db.prisma.userRole.count()).toBe(0);

    const sent = await emails("verify-email");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "asha@inst.test" });
    expect(sent[0]!.params.verificationUrl).toContain("/verify-email?token=");
  });

  it("confirming an institutional address verifies the account and grants the mapped role", async () => {
    const auth = makeAuth();
    await signUp(auth, "asha@inst.test");
    const [mail] = await emails("verify-email");

    await auth.api.verifyEmail({
      query: { token: tokenFrom(mail!.params.verificationUrl) },
    });

    const user = await db.prisma.user.findUniqueOrThrow({
      where: { email: "asha@inst.test" },
    });
    expect(user.emailVerified).toBe(true);
    expect(user.accountState).toBe("VERIFIED");
    const roles = await db.prisma.userRole.findMany({
      include: { role: true },
    });
    expect(roles.map((r) => r.role.name)).toEqual(["STUDENT"]);
  });

  it("re-using the verification link is a harmless no-op", async () => {
    const auth = makeAuth();
    await signUp(auth, "asha@inst.test");
    const token = tokenFrom(
      (await emails("verify-email"))[0]!.params.verificationUrl
    );

    await auth.api.verifyEmail({ query: { token } });
    await auth.api.verifyEmail({ query: { token } });

    expect(await db.prisma.userRole.count()).toBe(1);
    const user = await db.prisma.user.findUniqueOrThrow({
      where: { email: "asha@inst.test" },
    });
    expect(user.accountState).toBe("VERIFIED");
  });

  it.each([["asha@gmail.test"], ["asha@staff.inst.test"]])(
    "confirming %s leaves the account PENDING",
    async (email) => {
      const auth = makeAuth();
      await signUp(auth, email);
      const [mail] = await emails("verify-email");

      await auth.api.verifyEmail({
        query: { token: tokenFrom(mail!.params.verificationUrl) },
      });

      const user = await db.prisma.user.findUniqueOrThrow({ where: { email } });
      expect(user.emailVerified).toBe(true);
      expect(user.accountState).toBe("PENDING");
      expect(await db.prisma.userRole.count()).toBe(0);
    }
  );

  it("a second sign-up with the same email looks successful, creates nothing and tells the owner", async () => {
    const auth = makeAuth();
    await signUp(auth, "asha@inst.test");
    await signUp(auth, "asha@inst.test");

    expect(await db.prisma.user.count()).toBe(1);
    expect(await emails("verify-email")).toHaveLength(1);
    expect(await emails("existing-account")).toHaveLength(1);
  });

  it("a client cannot set accountState at sign-up", async () => {
    const auth = makeAuth();
    await auth.api
      .signUpEmail({
        body: {
          name: "Mallory",
          email: "mallory@gmail.test",
          password: PASSWORD,
          accountState: "VERIFIED",
        } as never,
      })
      .catch(() => undefined);

    const user = await db.prisma.user.findUnique({
      where: { email: "mallory@gmail.test" },
    });
    expect(user?.accountState ?? "PENDING").toBe("PENDING");
  });

  it("sign-up still succeeds when provisioning fails, and the profile is left for self-healing", async () => {
    const auth = makeAuth({
      provisionMember: async () => {
        throw new Error("boom");
      },
    });

    await signUp(auth, "asha@inst.test");

    expect(await db.prisma.user.count()).toBe(1);
    expect(await db.prisma.profile.count()).toBe(0);
    expect(await emails("verify-email")).toHaveLength(1);
  });

  it("password reset: unknown address queues nothing; a real one queues a single-use link", async () => {
    const auth = makeAuth();
    await signUp(auth, "asha@inst.test");
    await db.prisma.user.update({
      where: { email: "asha@inst.test" },
      data: { emailVerified: true },
    });

    await auth.api.requestPasswordReset({
      body: { email: "nobody@inst.test", redirectTo: "/reset-password" },
    });
    expect(await emails("reset-password")).toHaveLength(0);

    await auth.api.requestPasswordReset({
      body: { email: "asha@inst.test", redirectTo: "/reset-password" },
    });
    const [mail] = await emails("reset-password");
    const token = lastSegment(mail!.params.resetUrl.split("?")[0]!);

    await auth.api.resetPassword({
      body: { newPassword: "a-brand-new-passphrase", token },
    });
    await expect(
      auth.api.resetPassword({
        body: { newPassword: "another-new-passphrase", token },
      })
    ).rejects.toThrow();

    const session = await auth.api.signInEmail({
      body: { email: "asha@inst.test", password: "a-brand-new-passphrase" },
    });
    expect(session.user.email).toBe("asha@inst.test");
  });
});
