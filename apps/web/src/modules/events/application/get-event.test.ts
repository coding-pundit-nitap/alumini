import { describe, expect, it, vi } from "vitest";

import { PERMISSIONS } from "@nitap/database/permissions";

import { AuthorizationError, NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import type { EventDetailRow, EventQueries } from "./event-queries";
import { createGetEvent } from "./get-event";
import type { Authorize } from "./ports";

const actor = (userId: string) => ({ userId }) as Actor;

const detailRow = (organizerId: string): EventDetailRow => ({
  id: "ev-1",
  title: "Event",
  description: "A long enough description of the event.",
  startsAt: new Date("2026-02-01T00:00:00.000Z"),
  timezone: "UTC",
  location: null,
  isOnline: true,
  capacity: 10,
  registeredCount: 4,
  registrationDeadline: new Date("2026-01-31T00:00:00.000Z"),
  status: "SCHEDULED",
  organizer: { id: organizerId, name: "Org" },
  viewer: { registrationState: null },
});

function setup(
  row: EventDetailRow | null,
  options: { allowed?: boolean; canManageAny?: boolean } = {}
) {
  const get = vi.fn(async () => row);
  const asked: string[] = [];
  const authorize = ((a: Actor | null, permission: string) => {
    asked.push(permission);
    if (!a) throw new Error("no actor");
    if (options.allowed === false) throw new AuthorizationError();
    return a;
  }) as Authorize;
  const can = vi.fn(() => options.canManageAny ?? false);
  const queries: EventQueries = {
    list: vi.fn(),
    get,
    listRegistrants: vi.fn(),
  };
  return {
    get,
    asked,
    can,
    run: createGetEvent({ queries, authorize, can }),
  };
}

describe("createGetEvent", () => {
  it("requires event.read", async () => {
    const s = setup(detailRow("org-1"), { allowed: false });
    await expect(
      s.run({ actor: actor("u1"), eventId: "ev-1" })
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(s.asked).toEqual([PERMISSIONS.EVENT_READ]);
  });

  it("throws NotFoundError for an unknown id", async () => {
    const s = setup(null);
    await expect(
      s.run({ actor: actor("u1"), eventId: "missing" })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("canManage is true for the organizer", async () => {
    const s = setup(detailRow("org-1"));
    const result = await s.run({ actor: actor("org-1"), eventId: "ev-1" });
    expect(result.canManage).toBe(true);
    expect(s.can).not.toHaveBeenCalled();
  });

  it("canManage is true for an event.manage holder who isn't the organizer", async () => {
    const s = setup(detailRow("org-1"), { canManageAny: true });
    const result = await s.run({ actor: actor("stranger"), eventId: "ev-1" });
    expect(result.canManage).toBe(true);
    expect(s.can).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "stranger" }),
      PERMISSIONS.EVENT_MANAGE
    );
  });

  it("canManage is false for a stranger", async () => {
    const s = setup(detailRow("org-1"), { canManageAny: false });
    const result = await s.run({ actor: actor("stranger"), eventId: "ev-1" });
    expect(result.canManage).toBe(false);
  });

  it("computes spotsRemaining", async () => {
    const s = setup(detailRow("org-1"));
    const result = await s.run({ actor: actor("org-1"), eventId: "ev-1" });
    expect(result.spotsRemaining).toBe(6);
  });
});
