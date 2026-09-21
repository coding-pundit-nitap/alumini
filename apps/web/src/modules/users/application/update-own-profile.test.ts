import { describe, expect, it } from "vitest";

import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
} from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { createFakeProfileStore } from "../../../../tests/support/fake-profile-store";
import type { ProfileRecord } from "../domain/profile";
import { createUpdateOwnProfile } from "./update-own-profile";

const rec = (userId: string): ProfileRecord => ({
  userId,
  fullName: `Name ${userId}`,
  headline: null,
  bio: null,
  location: null,
  department: "CSE",
  degree: "B.Tech",
  graduationYear: 2019,
  settings: {
    visibility: "MEMBERS_ONLY",
    contact: null,
    location: null,
    experience: null,
    education: null,
  },
});
const actor = (
  userId = "u1",
  accountState: Actor["accountState"] = "VERIFIED"
): Actor => ({ userId, accountState, requestId: "r", grants: [] });
const allow = (a: Actor | null) => {
  if (!a) throw new AuthenticationError();
  return a;
};
const deny = (): never => {
  throw new AuthorizationError();
};
const input = {
  fullName: "New Name",
  headline: "Dev",
  bio: null,
  location: "Goa",
};

describe("updateOwnProfile", () => {
  it("updates the caller's own core fields only", async () => {
    const { store, records } = createFakeProfileStore([rec("u1"), rec("u2")]);
    await createUpdateOwnProfile({ store, authorize: allow })({
      actor: actor("u1"),
      input,
    });
    expect(records.get("u1")).toMatchObject({
      fullName: "New Name",
      headline: "Dev",
      location: "Goa",
    });
    expect(records.get("u2")?.fullName).toBe("Name u2");
  });

  it("leaves the institutional fields untouched", async () => {
    const { store, records } = createFakeProfileStore([rec("u1")]);
    await createUpdateOwnProfile({ store, authorize: allow })({
      actor: actor("u1"),
      input,
    });
    expect(records.get("u1")).toMatchObject({
      department: "CSE",
      degree: "B.Tech",
      graduationYear: 2019,
    });
  });

  it("has no way to name another user: a forged userId in the input is ignored", async () => {
    const { store, records } = createFakeProfileStore([rec("u1"), rec("u2")]);
    const forged = { ...input, userId: "u2" } as typeof input;
    await createUpdateOwnProfile({ store, authorize: allow })({
      actor: actor("u1"),
      input: forged,
    });
    expect(records.get("u2")?.fullName).toBe("Name u2");
  });

  it("refuses when authorization fails and writes nothing", async () => {
    const { store, records } = createFakeProfileStore([rec("u1")]);
    await expect(
      createUpdateOwnProfile({ store, authorize: deny })({
        actor: actor("u1", "SUSPENDED"),
        input,
      })
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(records.get("u1")?.fullName).toBe("Name u1");
  });

  it("requires a session", async () => {
    const { store } = createFakeProfileStore([rec("u1")]);
    await expect(
      createUpdateOwnProfile({ store, authorize: allow })({
        actor: null,
        input,
      })
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("fails with not-found when the caller has no profile row", async () => {
    const { store } = createFakeProfileStore([]);
    await expect(
      createUpdateOwnProfile({ store, authorize: allow })({
        actor: actor("u1"),
        input,
      })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
