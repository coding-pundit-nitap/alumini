import { describe, expect, it, vi } from "vitest";

import { PERMISSIONS } from "@nitap/database/permissions";

import { AuthorizationError, NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { encodeCursor } from "../domain/cursor";
import type { EventDetailRow, EventQueries, Registrant } from "./event-queries";
import { createListRegistrants } from "./list-registrants";
import type { Authorize } from "./ports";

const organizer = { userId: "organizer-1" } as Actor;
const stranger = { userId: "stranger-1" } as Actor;

const detailRow = (organizerId: string): EventDetailRow => ({
  id: "ev-1",
  title: "Event",
  description: "A long enough description of the event.",
  startsAt: new Date("2026-02-01T00:00:00.000Z"),
  timezone: "UTC",
  location: null,
  isOnline: true,
  capacity: 10,
  registeredCount: 1,
  registrationDeadline: new Date("2026-01-31T00:00:00.000Z"),
  status: "SCHEDULED",
  organizer: { id: organizerId, name: "Org" },
  viewer: { registrationState: null },
});

const registrant = (n: number): Registrant => ({
  registrationId: `reg-${n}`,
  userId: `user-${n}`,
  name: `Member ${n}`,
  state: "REGISTERED",
  registeredAt: new Date(Date.UTC(2026, 0, n)),
});

function setup(
  row: EventDetailRow | null,
  registrants: Registrant[] = [],
  options: { allowed?: boolean; canManageAny?: boolean } = {}
) {
  const get = vi.fn(async () => row);
  const listRegistrants = vi.fn(async () => registrants);
  const asked: string[] = [];
  const authorize = ((a: Actor | null, permission: string) => {
    asked.push(permission);
    if (!a) throw new Error("no actor");
    if (options.allowed === false) throw new AuthorizationError();
    return a;
  }) as Authorize;
  const can = vi.fn(() => options.canManageAny ?? false);
  const queries: EventQueries = { list: vi.fn(), get, listRegistrants };
  return {
    get,
    listRegistrants,
    asked,
    can,
    run: createListRegistrants({ queries, authorize, can }),
  };
}

describe("createListRegistrants", () => {
  it("requires event.read (base authentication)", async () => {
    const s = setup(detailRow("organizer-1"), [], { allowed: false });
    await expect(
      s.run({ actor: organizer, eventId: "ev-1" })
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(s.asked).toEqual([PERMISSIONS.EVENT_READ]);
  });

  it("throws NotFoundError for an unknown event", async () => {
    const s = setup(null);
    await expect(
      s.run({ actor: organizer, eventId: "missing" })
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(s.listRegistrants).not.toHaveBeenCalled();
  });

  it("lets the organizer list registrants", async () => {
    const s = setup(detailRow(organizer.userId), [registrant(1)]);
    const result = await s.run({ actor: organizer, eventId: "ev-1" });
    expect(result.data).toEqual([registrant(1)]);
  });

  it("lets an event.manage holder list registrants on someone else's event", async () => {
    const s = setup(detailRow(organizer.userId), [registrant(1)], {
      canManageAny: true,
    });
    await s.run({ actor: stranger, eventId: "ev-1" });
    expect(s.can).toHaveBeenCalledWith(
      expect.objectContaining({ userId: stranger.userId }),
      PERMISSIONS.EVENT_MANAGE
    );
  });

  it("refuses PERMISSION_DENIED for a stranger without event.manage", async () => {
    const s = setup(detailRow(organizer.userId), [], { canManageAny: false });
    try {
      await s.run({ actor: stranger, eventId: "ev-1" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AuthorizationError);
      expect((error as AuthorizationError).code).toBe("PERMISSION_DENIED");
    }
    expect(s.listRegistrants).not.toHaveBeenCalled();
  });

  it("paginates with a nextCursor keyed on (registeredAt, registrationId)", async () => {
    const rows = [registrant(1), registrant(2)];
    const s = setup(detailRow(organizer.userId), rows);
    const result = await s.run({ actor: organizer, eventId: "ev-1", limit: 1 });
    expect(result.data).toEqual([registrant(1)]);
    expect(result.page.nextCursor).toBe(
      encodeCursor({
        key: registrant(1).registeredAt.toISOString(),
        id: registrant(1).registrationId,
      })
    );
    expect(s.listRegistrants).toHaveBeenCalledWith(
      "ev-1",
      expect.objectContaining({ limit: 2 })
    );
  });

  it("nextCursor is null when there is no further page", async () => {
    const s = setup(detailRow(organizer.userId), [registrant(1)]);
    const result = await s.run({
      actor: organizer,
      eventId: "ev-1",
      limit: 20,
    });
    expect(result.page.nextCursor).toBeNull();
  });
});
