import { describe, expect, it, vi } from "vitest";

import { ValidationError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import type { BadgeStore } from "./badge-role";
import { createGetBadgeSettings, createSetBadgeRole } from "./badge-role";

const actor = {
  userId: "u1",
  accountState: "VERIFIED",
  requestId: "r",
  grants: [],
} as unknown as Actor;
const authorize = () => actor;

function store(roles: string[], preference: string | null = null) {
  const badges: BadgeStore = {
    readChoice: vi.fn(async () => ({ roles, preference })),
    setChoice: vi.fn(async () => true),
  };
  return badges;
}

describe("setBadgeRole", () => {
  it("saves a held role, automatic as null, and none", async () => {
    const badges = store(["ALUMNI", "MODERATOR"]);
    const set = createSetBadgeRole({ badges, authorize });
    await set({ actor, choice: "ALUMNI" });
    await set({ actor, choice: "AUTO" });
    await set({ actor, choice: "NONE" });
    expect(vi.mocked(badges.setChoice).mock.calls).toEqual([
      ["u1", "ALUMNI"],
      ["u1", null],
      ["u1", "NONE"],
    ]);
  });

  it("refuses a role the member doesn't hold, or junk", async () => {
    const set = createSetBadgeRole({ badges: store(["STUDENT"]), authorize });
    await expect(set({ actor, choice: "SUPER_ADMIN" })).rejects.toBeInstanceOf(
      ValidationError
    );
    await expect(set({ actor, choice: 7 })).rejects.toBeInstanceOf(
      ValidationError
    );
  });
});

describe("getBadgeSettings", () => {
  it("lists held roles, reads a revoked choice as automatic, and says what shows", async () => {
    const get = createGetBadgeSettings({
      badges: store(["STUDENT", "MODERATOR"], "ALUMNI"),
      authorize,
    });
    const settings = await get({ actor });
    expect(settings.options.map((o) => o.role)).toEqual([
      "MODERATOR",
      "STUDENT",
    ]);
    expect(settings.choice).toBe("AUTO");
    expect(settings.current?.role).toBe("MODERATOR");
  });
});
