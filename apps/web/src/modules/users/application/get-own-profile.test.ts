import { describe, expect, it } from "vitest";

import { AuthenticationError, NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { createFakeProfileStore } from "../../../../tests/support/fake-profile-store";
import type { ProfileRecord } from "../domain/profile";
import { createGetOwnProfile } from "./get-own-profile";

const record: ProfileRecord = {
  userId: "u1",
  fullName: "Asha",
  headline: null,
  bio: null,
  location: null,
  department: null,
  degree: null,
  graduationYear: null,
  experience: [],
  education: [],
  skills: [],
  links: [],
  settings: {
    visibility: "MEMBERS_ONLY",
    contact: null,
    location: null,
    experience: null,
    education: null,
  },
};
const actor = (userId = "u1"): Actor => ({
  userId,
  accountState: "PENDING",
  requestId: "r",
  grants: [],
});

describe("getOwnProfile", () => {
  const { store } = createFakeProfileStore([record]);
  const get = createGetOwnProfile({ store });

  it("returns the caller's own record, including a PENDING account's", async () => {
    expect(await get({ actor: actor() })).toEqual(record);
  });
  it("requires an actor", async () => {
    await expect(get({ actor: null })).rejects.toBeInstanceOf(
      AuthenticationError
    );
  });
  it("fails with not-found when the caller has no profile row", async () => {
    await expect(get({ actor: actor("nobody") })).rejects.toBeInstanceOf(
      NotFoundError
    );
  });
});
