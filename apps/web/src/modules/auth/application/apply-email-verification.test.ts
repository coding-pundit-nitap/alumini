import { describe, expect, it } from "vitest";

import { createFakeMemberStore } from "../../../../tests/support/fake-member-store";
import type { EmailPolicy } from "../domain/email-policy";
import { createApplyEmailVerification } from "./apply-email-verification";

const policy: EmailPolicy = new Map([
  ["inst.test", { role: "STUDENT", autoVerify: true }],
  ["staff.inst.test", { role: "STAFF", autoVerify: false }],
]);

const make = (
  overrides: Partial<{
    email: string;
    emailVerified: boolean;
    accountState: string;
  }> = {}
) => ({
  id: "u1",
  name: "Asha",
  email: "asha@inst.test",
  emailVerified: true,
  accountState: "PENDING",
  ...overrides,
});

const setup = (user = make()) => {
  const fake = createFakeMemberStore([user]);
  const apply = createApplyEmailVerification({
    store: fake.store,
    policy: () => policy,
  });
  return { fake, apply };
};

describe("applyEmailVerification", () => {
  it("verifies an institutional address and grants the mapped role to the user by policy", async () => {
    const { fake, apply } = setup();

    expect(await apply("u1")).toEqual({ outcome: "verified", role: "STUDENT" });
    expect(fake.stateOf("u1")).toBe("VERIFIED");
    expect(fake.roles).toEqual([
      { userId: "u1", roleName: "STUDENT", grantedBy: "u1" },
    ]);
  });

  it("leaves a recognised domain that needs confirmation PENDING", async () => {
    const { fake, apply } = setup(make({ email: "x@staff.inst.test" }));

    expect(await apply("u1")).toEqual({ outcome: "pending" });
    expect(fake.stateOf("u1")).toBe("PENDING");
    expect(fake.roles).toEqual([]);
  });

  it("leaves an external address PENDING", async () => {
    const { fake, apply } = setup(make({ email: "x@gmail.test" }));

    expect(await apply("u1")).toEqual({ outcome: "pending" });
    expect(fake.stateOf("u1")).toBe("PENDING");
  });

  it("does nothing while the email is not verified", async () => {
    const { fake, apply } = setup(make({ emailVerified: false }));

    expect(await apply("u1")).toEqual({ outcome: "pending" });
    expect(fake.stateOf("u1")).toBe("PENDING");
    expect(fake.calls.markVerified).toBe(0);
  });

  it.each(["VERIFIED", "REJECTED", "SUSPENDED", "DEACTIVATED"])(
    "never changes a %s account",
    async (accountState) => {
      const { fake, apply } = setup(make({ accountState }));

      expect(await apply("u1")).toEqual({ outcome: "unchanged" });
      expect(fake.stateOf("u1")).toBe(accountState);
      expect(fake.roles).toEqual([]);
    }
  );

  it("is idempotent: the second call is unchanged and adds no role", async () => {
    const { fake, apply } = setup();

    await apply("u1");
    expect(await apply("u1")).toEqual({ outcome: "unchanged" });
    expect(fake.roles).toHaveLength(1);
  });

  it("assigns no role when it loses the race to the guarded update", async () => {
    const { fake, apply } = setup();
    fake.forceMarkVerified(false);

    expect(await apply("u1")).toEqual({ outcome: "unchanged" });
    expect(fake.roles).toEqual([]);
  });

  it("fails loudly for a user that does not exist", async () => {
    const fake = createFakeMemberStore([]);
    const apply = createApplyEmailVerification({
      store: fake.store,
      policy: () => policy,
    });

    await expect(apply("missing")).rejects.toThrow(/unknown user/);
  });
});
