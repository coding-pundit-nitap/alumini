import { describe, expect, it, vi } from "vitest";

import { NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { createFakeProfileStore } from "../../../../tests/support/fake-profile-store";
import type { ProfileRecord } from "../domain/profile";
import type { VisibilitySettings } from "../domain/visibility";
import { createGetProfilePhotoKey } from "./get-profile-photo-key";

const settings = (
  over: Partial<VisibilitySettings> = {}
): VisibilitySettings => ({
  visibility: "MEMBERS_ONLY",
  contact: null,
  location: null,
  experience: null,
  education: null,
  ...over,
});
const owner = (over: Partial<ProfileRecord> = {}): ProfileRecord => ({
  userId: "owner",
  fullName: "Asha Rao",
  headline: null,
  bio: null,
  location: null,
  department: null,
  degree: null,
  graduationYear: null,
  photoUploadId: "photo-1",
  experience: [],
  education: [],
  skills: [],
  links: [],
  settings: settings(),
  ...over,
});
const actor = (over: Partial<Actor> = {}): Actor => ({
  userId: "viewer",
  accountState: "VERIFIED",
  requestId: "r",
  grants: [],
  ...over,
});

function setup(
  opts: {
    record?: ProfileRecord;
    permissions?: string[];
    photoKey?: string | null;
  } = {}
) {
  const { store: profileStore } = createFakeProfileStore([
    opts.record ?? owner(),
  ]);
  const store = {
    ...profileStore,
    findPhotoKey: vi.fn(async () =>
      opts.photoKey !== undefined ? opts.photoKey : "avatars/owner/photo-1.webp"
    ),
  };
  const get = createGetProfilePhotoKey({
    store,
    connections: {
      async relation() {
        return "none";
      },
    },
    can: (_a, permission) =>
      (opts.permissions ?? ["profile.read"]).includes(permission),
  });
  return { get, store };
}

describe("getProfilePhotoKey", () => {
  it("returns the object key when the viewer can see the profile's core", async () => {
    const { get } = setup();
    expect(await get({ actor: actor(), targetUserId: "owner" })).toEqual({
      objectKey: "avatars/owner/photo-1.webp",
    });
  });

  it("a guest sees the photo of a PUBLIC profile", async () => {
    const { get } = setup({
      record: owner({ settings: settings({ visibility: "PUBLIC" }) }),
    });
    expect(await get({ actor: null, targetUserId: "owner" })).toEqual({
      objectKey: "avatars/owner/photo-1.webp",
    });
  });

  it("not-found when the viewer cannot see the profile's core", async () => {
    const { get } = setup();
    await expect(
      get({ actor: null, targetUserId: "owner" })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("not-found when the profile has no photo attached", async () => {
    const { get } = setup({ record: owner({ photoUploadId: null }) });
    await expect(
      get({ actor: actor(), targetUserId: "owner" })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("not-found when the store has no key (edge case: the row changed mid-request)", async () => {
    const { get } = setup({ photoKey: null });
    await expect(
      get({ actor: actor(), targetUserId: "owner" })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("not-found for an unknown user", async () => {
    const { get } = setup();
    await expect(
      get({ actor: actor(), targetUserId: "missing" })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
