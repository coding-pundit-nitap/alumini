import { describe, expect, it, vi } from "vitest";
import { PERMISSIONS, type Permission } from "@nitap/database/permissions";

import { AuthenticationError, NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import type { AdminStore } from "./admin-store";
import { createGetDashboard } from "./get-dashboard";

const actor: Actor = {
  userId: "u1",
  accountState: "VERIFIED",
  requestId: "r",
  grants: [],
};
const canOnly =
  (...held: Permission[]) =>
  (_a: Actor, p: Permission) =>
    held.includes(p);

function store(counts: Partial<Record<string, number | Error>>): AdminStore {
  return {
    countTile: vi.fn(async (key: string) => {
      const v = counts[key];
      if (v instanceof Error) throw v;
      return v ?? 0;
    }),
    listAuditLog: vi.fn(),
  };
}

describe("getDashboard", () => {
  it("401s without an actor", async () => {
    const get = createGetDashboard({ store: store({}), can: canOnly() });
    await expect(get({ actor: null })).rejects.toBeInstanceOf(
      AuthenticationError
    );
  });

  it("404s for an actor with no admin-tier permission, without touching the store", async () => {
    const s = store({});
    const get = createGetDashboard({
      store: s,
      can: canOnly(PERMISSIONS.POST_CREATE),
    });
    await expect(get({ actor })).rejects.toBeInstanceOf(NotFoundError);
    expect(s.countTile).not.toHaveBeenCalled();
  });

  it("counts only the permitted tiles and marks a failed one unavailable", async () => {
    const onTileFailed = vi.fn();
    const s = store({ pendingJobs: 3, openReports: new Error("db down") });
    const get = createGetDashboard({
      store: s,
      can: canOnly(PERMISSIONS.JOB_APPROVE, PERMISSIONS.REPORT_REVIEW),
      onTileFailed,
    });
    expect(await get({ actor })).toEqual([
      { key: "openReports", status: "unavailable" },
      { key: "pendingJobs", status: "ok", value: 3 },
    ]);
    expect(s.countTile).toHaveBeenCalledTimes(2);
    expect(onTileFailed).toHaveBeenCalledWith("openReports", expect.any(Error));
  });
});
