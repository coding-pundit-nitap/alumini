import { describe, expect, it } from "vitest";

import {
  AuthenticationError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { createFakeProfileStore } from "../../../../tests/support/fake-profile-store";
import type { ProfileRecord } from "../domain/profile";
import { createUpdateOwnPrivacy } from "./update-own-privacy";

const rec = (userId: string): ProfileRecord => ({
  userId,
  fullName: "N",
  headline: null,
  bio: null,
  location: null,
  department: null,
  degree: null,
  graduationYear: null,
  settings: {
    visibility: "MEMBERS_ONLY",
    contact: null,
    location: null,
    experience: null,
    education: null,
  },
});
const actor = (userId = "u1"): Actor => ({
  userId,
  accountState: "PENDING",
  requestId: "r",
  grants: [],
});
const allow = (a: Actor | null) => {
  if (!a) throw new AuthenticationError();
  return a;
};
const settings = (over = {}) => ({
  visibility: "PRIVATE" as const,
  contact: null,
  location: null,
  experience: null,
  education: null,
  ...over,
});

describe("updateOwnPrivacy", () => {
  it("replaces the caller's five settings, and only theirs", async () => {
    const { store, records } = createFakeProfileStore([rec("u1"), rec("u2")]);
    await createUpdateOwnPrivacy({ store, authorize: allow })({
      actor: actor("u1"),
      input: settings({ visibility: "PUBLIC", location: "PRIVATE" }),
    });
    expect(records.get("u1")?.settings).toEqual(
      settings({ visibility: "PUBLIC", location: "PRIVATE" })
    );
    expect(records.get("u2")?.settings.visibility).toBe("MEMBERS_ONLY");
  });

  it("rejects an override looser than the level as a per-field validation error and writes nothing", async () => {
    const { store, records } = createFakeProfileStore([rec("u1")]);
    const error = await createUpdateOwnPrivacy({ store, authorize: allow })({
      actor: actor("u1"),
      input: settings({ visibility: "PRIVATE", location: "PUBLIC" }),
    }).catch((e) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).details).toEqual([
      expect.objectContaining({ field: "location" }),
    ]);
    expect(records.get("u1")?.settings.visibility).toBe("MEMBERS_ONLY");
  });

  it("fails with not-found when the caller has no profile row", async () => {
    const { store } = createFakeProfileStore([]);
    await expect(
      createUpdateOwnPrivacy({ store, authorize: allow })({
        actor: actor("u1"),
        input: settings(),
      })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
