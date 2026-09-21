import { describe, expect, it } from "vitest";

import { createFakeMemberStore } from "../../../../tests/support/fake-member-store";
import { createProvisionMember } from "./provision-member";

const user = {
  id: "u1",
  name: "Asha Rao",
  email: "asha@example.test",
  emailVerified: false,
  accountState: "PENDING",
};

describe("provisionMember", () => {
  it("creates the profile from the user's name and assigns no role", async () => {
    const fake = createFakeMemberStore([user]);
    const provision = createProvisionMember({ store: fake.store });

    expect(await provision("u1")).toEqual({ created: true });
    expect(fake.profiles.get("u1")).toBe("Asha Rao");
    expect(fake.roles).toEqual([]);
  });

  it("is idempotent: a second call creates nothing", async () => {
    const fake = createFakeMemberStore([user]);
    const provision = createProvisionMember({ store: fake.store });

    await provision("u1");
    expect(await provision("u1")).toEqual({ created: false });
    expect(fake.profiles.size).toBe(1);
  });

  it("fails loudly for a user that does not exist", async () => {
    const fake = createFakeMemberStore([]);
    const provision = createProvisionMember({ store: fake.store });

    await expect(provision("missing")).rejects.toThrow(/unknown user/);
  });
});
