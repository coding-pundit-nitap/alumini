import { describe, expect, it, vi } from "vitest";

import { UnexpectedError } from "@/lib/errors";

import type { Grant } from "../domain/actor";
import { PERMISSIONS } from "../domain/permission";
import type { GrantSource } from "./grant-source";
import { resolveActor } from "./resolve-actor";

const NOW = new Date("2026-09-21T00:00:00.000Z");
const GRANT: Grant = {
  permission: PERMISSIONS.PROFILE_READ,
  scope: "GLOBAL",
  expiresAt: null,
};

function setup() {
  const loadGrants = vi.fn<GrantSource["loadGrants"]>(async () => [GRANT]);
  const deps = { grantSource: { loadGrants }, now: () => NOW };
  return { loadGrants, deps };
}

describe("resolveActor", () => {
  it("loads grants for a VERIFIED account, passing the clock", async () => {
    const { loadGrants, deps } = setup();
    const actor = await resolveActor(
      deps,
      { userId: "u1", accountState: "VERIFIED" },
      "req-1"
    );
    expect(loadGrants).toHaveBeenCalledWith("u1", NOW);
    expect(actor).toEqual({
      userId: "u1",
      accountState: "VERIFIED",
      requestId: "req-1",
      grants: [GRANT],
    });
  });

  it.each(["PENDING", "REJECTED", "SUSPENDED", "DEACTIVATED"])(
    "does not load grants for a %s account (RBAC §7)",
    async (accountState) => {
      const { loadGrants, deps } = setup();
      const actor = await resolveActor(
        deps,
        { userId: "u1", accountState },
        "req-1"
      );
      expect(loadGrants).not.toHaveBeenCalled();
      expect(actor.grants).toEqual([]);
      expect(actor.accountState).toBe(accountState);
    }
  );

  it("fails loudly on an account state it does not know", async () => {
    const { loadGrants, deps } = setup();
    await expect(
      resolveActor(deps, { userId: "u1", accountState: "GOD_MODE" }, "req-1")
    ).rejects.toBeInstanceOf(UnexpectedError);
    await expect(
      resolveActor(deps, { userId: "u1", accountState: undefined }, "req-1")
    ).rejects.toBeInstanceOf(UnexpectedError);
    expect(loadGrants).not.toHaveBeenCalled();
  });
});
