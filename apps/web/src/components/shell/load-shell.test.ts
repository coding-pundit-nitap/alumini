import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActor: vi.fn(),
  can: vi.fn(() => false),
  getOwnProfile: vi.fn(),
  getMentorProfile: vi.fn(),
  loadTicks: vi.fn(),
}));
vi.mock("@/modules/auth", () => ({ getActor: mocks.getActor, can: mocks.can }));
vi.mock("@/composition/users", () => ({ getOwnProfile: mocks.getOwnProfile }));
vi.mock("@/composition/mentorship", () => ({
  getMentorProfile: mocks.getMentorProfile,
}));
vi.mock("@/composition/ticks", () => ({ loadTicks: mocks.loadTicks }));

import { loadShell } from "./load-shell";

const actor = (accountState = "VERIFIED") => ({
  userId: "u1",
  accountState,
  requestId: "r",
  grants: [],
});

beforeEach(() => {
  mocks.getActor.mockResolvedValue(actor());
  mocks.getOwnProfile.mockResolvedValue({
    fullName: "Asha Rao",
    headline: "SDE",
    photoUploadId: "p1",
  });
  mocks.getMentorProfile.mockResolvedValue({ userId: "u1" });
  mocks.loadTicks.mockResolvedValue(new Map([["u1", "ALUMNI"]]));
});

describe("loadShell", () => {
  it("is null when signed out", async () => {
    mocks.getActor.mockResolvedValue(null);
    expect(await loadShell()).toBeNull();
  });

  it("builds the user and nav for a verified mentor", async () => {
    const data = await loadShell();
    expect(data?.verified).toBe(true);
    expect(data?.user).toEqual({
      id: "u1",
      name: "Asha Rao",
      headline: "SDE",
      photoUrl: "/api/photos/u1",
      tick: "ALUMNI",
    });
    expect(data?.nav.groups.length).toBeGreaterThan(0);
  });

  it("falls back when the profile, mentor profile and ticks fail", async () => {
    mocks.getOwnProfile.mockRejectedValue(new Error("down"));
    mocks.getMentorProfile.mockRejectedValue(new Error("down"));
    mocks.loadTicks.mockRejectedValue(new Error("down"));
    const data = await loadShell();
    expect(data?.user).toEqual({
      id: "u1",
      name: "Member",
      headline: null,
      photoUrl: null,
      tick: null,
    });
  });

  it("skips the mentor lookup for a member who is not verified", async () => {
    mocks.getActor.mockResolvedValue(actor("PENDING"));
    mocks.getOwnProfile.mockResolvedValue({
      fullName: "",
      headline: null,
      photoUploadId: null,
    });
    const data = await loadShell();
    expect(data?.verified).toBe(false);
    expect(data?.user.name).toBe("Member");
    expect(mocks.getMentorProfile).not.toHaveBeenCalled();
  });
});
