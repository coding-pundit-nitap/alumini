import { describe, expect, it, vi } from "vitest";

import { PERMISSIONS } from "@nitap/database/permissions";

import { AuthorizationError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { encodeCursor } from "../domain/cursor";
import type { EventQueries, EventSummaryRow } from "./event-queries";
import { createListEvents } from "./list-events";
import type { Authorize } from "./ports";

const actor = { userId: "u1" } as Actor;

const row = (n: number): EventSummaryRow => ({
  id: `ev-${n}`,
  title: `Event ${n}`,
  startsAt: new Date(Date.UTC(2026, 1, n, 0, 0, 0)),
  timezone: "UTC",
  location: null,
  isOnline: true,
  capacity: 10,
  registeredCount: 3,
  registrationDeadline: new Date(Date.UTC(2026, 1, n - 1, 0, 0, 0)),
  status: "SCHEDULED",
  organizer: { id: "org-1", name: "Org" },
  viewer: { registrationState: null },
});

function setup(
  rows: EventSummaryRow[] = [],
  options: { allowed?: boolean } = {}
) {
  const list = vi.fn(async () => rows);
  const asked: string[] = [];
  const authorize = ((a: Actor | null, permission: string) => {
    asked.push(permission);
    if (!a) throw new Error("no actor");
    if (options.allowed === false) throw new AuthorizationError();
    return a;
  }) as Authorize;
  const queries: EventQueries = { list, get: vi.fn() };
  return {
    list,
    asked,
    run: createListEvents({ queries, authorize }),
  };
}

describe("createListEvents", () => {
  it("requires event.read", async () => {
    const s = setup([], { allowed: false });
    await expect(s.run({ actor, scope: "upcoming" })).rejects.toBeInstanceOf(
      AuthorizationError
    );
    expect(s.asked).toEqual([PERMISSIONS.EVENT_READ]);
  });

  it("clamps the limit, fetches one extra row, and passes scope/includeCancelled through", async () => {
    const s = setup();
    await s.run({ actor, scope: "mine", includeCancelled: true, limit: 500 });
    expect(s.list).toHaveBeenCalledWith("u1", {
      scope: "mine",
      includeCancelled: true,
      limit: 51,
      after: undefined,
    });
  });

  it("defaults includeCancelled to false and limit to 20", async () => {
    const s = setup();
    await s.run({ actor, scope: "upcoming" });
    expect(s.list).toHaveBeenCalledWith("u1", {
      scope: "upcoming",
      includeCancelled: false,
      limit: 21,
      after: undefined,
    });
  });

  it("computes spotsRemaining from capacity minus registeredCount", async () => {
    const s = setup([row(1)]);
    const result = await s.run({ actor, scope: "upcoming" });
    expect(result.data[0]).toMatchObject({
      capacity: 10,
      registeredCount: 3,
      spotsRemaining: 7,
    });
  });

  it("pages: nextCursor is the last kept row's startsAt ISO + id; none on the last page", async () => {
    const rows = [row(1), row(2), row(3)];
    const first = await setup(rows).run({ actor, scope: "upcoming", limit: 2 });
    expect(first.data.map((r) => r.id)).toEqual(["ev-1", "ev-2"]);
    expect(first.page.nextCursor).toBe(
      encodeCursor({ key: rows[1]!.startsAt.toISOString(), id: "ev-2" })
    );

    const last = await setup(rows.slice(0, 2)).run({
      actor,
      scope: "upcoming",
      limit: 2,
    });
    expect(last.page.nextCursor).toBeNull();
  });

  it("decodes a supplied cursor into `after`", async () => {
    const s = setup();
    const cursor = encodeCursor({
      key: "2026-01-01T00:00:00.000Z",
      id: "ev-9",
    });
    await s.run({ actor, scope: "past", cursor });
    expect(s.list).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({
        after: { key: "2026-01-01T00:00:00.000Z", id: "ev-9" },
      })
    );
  });
});
