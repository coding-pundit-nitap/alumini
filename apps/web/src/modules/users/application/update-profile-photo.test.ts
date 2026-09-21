import { describe, expect, it } from "vitest";

import { AuthenticationError, NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { createFakeProfileStore } from "../../../../tests/support/fake-profile-store";
import type { ProfileRecord } from "../domain/profile";
import { createUpdateProfilePhoto } from "./update-profile-photo";

const rec = (userId: string): ProfileRecord => ({
  userId,
  fullName: `Name ${userId}`,
  headline: null,
  bio: null,
  location: null,
  department: null,
  degree: null,
  graduationYear: null,
  photoUploadId: null,
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
});
const actor = (userId = "u1"): Actor => ({
  userId,
  accountState: "VERIFIED",
  requestId: "r",
  grants: [],
});
const allow = (a: Actor | null) => {
  if (!a) throw new AuthenticationError();
  return a;
};

describe("updateProfilePhoto", () => {
  it("sets the caller's own photo, and only theirs", async () => {
    const { store, records } = createFakeProfileStore([rec("u1"), rec("u2")]);
    await createUpdateProfilePhoto({ store, authorize: allow })({
      actor: actor("u1"),
      photoUploadId: "upload-1",
    });
    expect(records.get("u1")?.photoUploadId).toBe("upload-1");
    expect(records.get("u2")?.photoUploadId).toBeNull();
  });

  it("clears the photo when given null (removing a photo)", async () => {
    const { store, records } = createFakeProfileStore([
      { ...rec("u1"), photoUploadId: "old" },
    ]);
    await createUpdateProfilePhoto({ store, authorize: allow })({
      actor: actor("u1"),
      photoUploadId: null,
    });
    expect(records.get("u1")?.photoUploadId).toBeNull();
  });

  it("has no way to name another user: nothing but the caller's own id is ever touched", async () => {
    const { store, records } = createFakeProfileStore([rec("u1"), rec("u2")]);
    await createUpdateProfilePhoto({ store, authorize: allow })({
      actor: actor("u1"),
      photoUploadId: "upload-1",
    });
    expect(records.get("u2")?.photoUploadId).toBeNull();
  });

  it("requires a session", async () => {
    const { store } = createFakeProfileStore([rec("u1")]);
    await expect(
      createUpdateProfilePhoto({ store, authorize: allow })({
        actor: null,
        photoUploadId: "upload-1",
      })
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("fails with not-found when the caller has no profile row", async () => {
    const { store } = createFakeProfileStore([]);
    await expect(
      createUpdateProfilePhoto({ store, authorize: allow })({
        actor: actor("u1"),
        photoUploadId: "upload-1",
      })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
