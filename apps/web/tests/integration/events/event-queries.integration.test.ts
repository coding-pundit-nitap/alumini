import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { createPrismaEventQueries } from "@/modules/events/infrastructure/prisma-event-queries";

const HOUR = 60 * 60 * 1000;

describe("PrismaEventQueries against real PostgreSQL", () => {
  let db: TestDatabase;
  let n = 0;

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    n = 0;
  });
  afterEach(async () => {
    await db.drop();
  });

  const queries = () => createPrismaEventQueries(db.prisma);

  async function user(name: string, withProfile = true): Promise<string> {
    n += 1;
    const u = await db.prisma.user.create({
      data: {
        name,
        email: `u${n}@example.test`,
        accountState: "VERIFIED",
      },
    });
    if (withProfile) {
      await db.prisma.profile.create({
        data: { userId: u.id, fullName: `${name} Full Name` },
      });
    }
    return u.id;
  }

  async function event(
    organizerId: string,
    opts: {
      startsAt: Date;
      registrationDeadline?: Date;
      capacity?: number;
      registeredCount?: number;
      status?: "SCHEDULED" | "CANCELLED";
      title?: string;
    }
  ): Promise<string> {
    const e = await db.prisma.event.create({
      data: {
        organizerId,
        title: opts.title ?? "Event",
        description: "A description of the event for detail views.",
        startsAt: opts.startsAt,
        timezone: "UTC",
        location: null,
        isOnline: true,
        capacity: opts.capacity ?? 10,
        registeredCount: opts.registeredCount ?? 0,
        registrationDeadline:
          opts.registrationDeadline ?? new Date(opts.startsAt.getTime() - HOUR),
        status: opts.status ?? "SCHEDULED",
        cancelledAt: opts.status === "CANCELLED" ? new Date() : null,
      },
    });
    return e.id;
  }

  const register = (
    eventId: string,
    userId: string,
    state: "REGISTERED" | "CANCELLED" | "ATTENDED" | "NO_SHOW" = "REGISTERED"
  ) => db.prisma.eventRegistration.create({ data: { eventId, userId, state } });

  describe("list: ordering and scopes", () => {
    it("upcoming: ascending by starts_at then id, only future SCHEDULED events by default", async () => {
      const organizer = await user("Org");
      const now = Date.now();
      const soon = await event(organizer, { startsAt: new Date(now + HOUR) });
      const later = await event(organizer, {
        startsAt: new Date(now + 2 * HOUR),
      });
      const past = await event(organizer, { startsAt: new Date(now - HOUR) });

      const rows = await queries().list(organizer, {
        scope: "upcoming",
        includeCancelled: false,
        limit: 10,
      });
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(soon);
      expect(ids).toContain(later);
      expect(ids).not.toContain(past);
      expect(ids.indexOf(soon)).toBeLessThan(ids.indexOf(later));
    });

    it("past: strictly before now, newest first (descending)", async () => {
      const organizer = await user("Org2");
      const now = Date.now();
      const older = await event(organizer, {
        startsAt: new Date(now - 2 * HOUR),
      });
      const newer = await event(organizer, { startsAt: new Date(now - HOUR) });
      const future = await event(organizer, { startsAt: new Date(now + HOUR) });

      const rows = await queries().list(organizer, {
        scope: "past",
        includeCancelled: false,
        limit: 10,
      });
      const ids = rows.map((r) => r.id);
      expect(ids).not.toContain(future);
      expect(ids.indexOf(newer)).toBeLessThan(ids.indexOf(older));
    });

    it("mine: only events the caller holds a non-cancelled registration on, any time, ascending", async () => {
      const organizer = await user("Org3");
      const caller = await user("Caller");
      const now = Date.now();
      const registeredPast = await event(organizer, {
        startsAt: new Date(now - HOUR),
      });
      const registeredFuture = await event(organizer, {
        startsAt: new Date(now + HOUR),
      });
      const cancelledReg = await event(organizer, {
        startsAt: new Date(now + 2 * HOUR),
      });
      const notRegistered = await event(organizer, {
        startsAt: new Date(now + 3 * HOUR),
      });

      await register(registeredPast, caller, "REGISTERED");
      await register(registeredFuture, caller, "REGISTERED");
      await register(cancelledReg, caller, "CANCELLED");

      const rows = await queries().list(caller, {
        scope: "mine",
        includeCancelled: false,
        limit: 10,
      });
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(registeredPast);
      expect(ids).toContain(registeredFuture);
      expect(ids).not.toContain(cancelledReg);
      expect(ids).not.toContain(notRegistered);
      expect(ids.indexOf(registeredPast)).toBeLessThan(
        ids.indexOf(registeredFuture)
      );
    });
  });

  describe("list: cursor paging", () => {
    it("pages upcoming events across two calls with no duplicates, same total order", async () => {
      const organizer = await user("Org4");
      const now = Date.now();
      const ids: string[] = [];
      for (let i = 1; i <= 5; i += 1) {
        ids.push(
          await event(organizer, { startsAt: new Date(now + i * HOUR) })
        );
      }

      const q = queries();
      const first = await q.list(organizer, {
        scope: "upcoming",
        includeCancelled: false,
        limit: 3,
      });
      expect(first).toHaveLength(3);

      const last = first.at(-1)!;
      const second = await q.list(organizer, {
        scope: "upcoming",
        includeCancelled: false,
        limit: 3,
        after: { key: last.startsAt.toISOString(), id: last.id },
      });

      const combinedIds = [...first, ...second].map((r) => r.id);
      expect(new Set(combinedIds).size).toBe(5);
      expect(combinedIds).toEqual(ids);
    });
  });

  describe("list: cancelled visibility", () => {
    it("upcoming hides a CANCELLED event by default, shows it with includeCancelled", async () => {
      const organizer = await user("Org5");
      const now = Date.now();
      const cancelled = await event(organizer, {
        startsAt: new Date(now + HOUR),
        status: "CANCELLED",
      });

      const hidden = await queries().list(organizer, {
        scope: "upcoming",
        includeCancelled: false,
        limit: 10,
      });
      expect(hidden.map((r) => r.id)).not.toContain(cancelled);

      const shown = await queries().list(organizer, {
        scope: "upcoming",
        includeCancelled: true,
        limit: 10,
      });
      expect(shown.map((r) => r.id)).toContain(cancelled);
      expect(shown.find((r) => r.id === cancelled)?.status).toBe("CANCELLED");
    });

    it("mine still shows the caller's registration on a CANCELLED event even when includeCancelled is false", async () => {
      const organizer = await user("Org6");
      const caller = await user("Caller2");
      const now = Date.now();
      const cancelled = await event(organizer, {
        startsAt: new Date(now + HOUR),
        status: "CANCELLED",
      });
      await register(cancelled, caller, "REGISTERED");

      const rows = await queries().list(caller, {
        scope: "mine",
        includeCancelled: false,
        limit: 10,
      });
      expect(rows.map((r) => r.id)).toContain(cancelled);
    });
  });

  describe("viewer registrationState", () => {
    it("reports the caller's own state, and null when they have none", async () => {
      const organizer = await user("Org7");
      const caller = await user("Caller3");
      const now = Date.now();
      const registered = await event(organizer, {
        startsAt: new Date(now + HOUR),
      });
      const untouched = await event(organizer, {
        startsAt: new Date(now + 2 * HOUR),
      });
      await register(registered, caller, "REGISTERED");

      const rows = await queries().list(caller, {
        scope: "upcoming",
        includeCancelled: false,
        limit: 10,
      });
      expect(
        rows.find((r) => r.id === registered)?.viewer.registrationState
      ).toBe("REGISTERED");
      expect(
        rows.find((r) => r.id === untouched)?.viewer.registrationState
      ).toBeNull();
    });
  });

  describe("organizer name", () => {
    it("uses the profile full_name when present, falling back to user.name otherwise", async () => {
      const withProfile = await user("Has Profile", true);
      const withoutProfile = await user("No Profile", false);
      const caller = await user("Viewer");
      const now = Date.now();
      const e1 = await event(withProfile, { startsAt: new Date(now + HOUR) });
      const e2 = await event(withoutProfile, {
        startsAt: new Date(now + 2 * HOUR),
      });

      const rows = await queries().list(caller, {
        scope: "upcoming",
        includeCancelled: false,
        limit: 10,
      });
      expect(rows.find((r) => r.id === e1)?.organizer).toEqual({
        id: withProfile,
        name: "Has Profile Full Name",
      });
      expect(rows.find((r) => r.id === e2)?.organizer).toEqual({
        id: withoutProfile,
        name: "No Profile",
      });
    });
  });

  describe("get", () => {
    it("returns the detail row including description, and null for an unknown id", async () => {
      const organizer = await user("Org8");
      const caller = await user("Caller4");
      const now = Date.now();
      const id = await event(organizer, { startsAt: new Date(now + HOUR) });

      const found = await queries().get(caller, id);
      expect(found).toMatchObject({
        id,
        description: "A description of the event for detail views.",
        organizer: { id: organizer },
      });

      const missing = await queries().get(
        caller,
        "00000000-0000-0000-0000-000000000000"
      );
      expect(missing).toBeNull();
    });
  });

  describe("listRegistrants", () => {
    it("orders by (registered_at, id) ascending, with names from the user/profile join", async () => {
      const organizer = await user("Org9");
      const first = await user("Alice", true);
      const second = await user("Bob", false);
      const id = await event(organizer, {
        startsAt: new Date(Date.now() + HOUR),
      });

      await db.prisma.eventRegistration.create({
        data: {
          eventId: id,
          userId: first,
          state: "REGISTERED",
          registeredAt: new Date(Date.now() - HOUR),
        },
      });
      await db.prisma.eventRegistration.create({
        data: {
          eventId: id,
          userId: second,
          state: "ATTENDED",
          registeredAt: new Date(Date.now()),
        },
      });

      const rows = await queries().listRegistrants(id, { limit: 10 });
      expect(rows.map((r) => r.userId)).toEqual([first, second]);
      expect(rows[0]).toMatchObject({
        name: "Alice Full Name",
        state: "REGISTERED",
      });
      expect(rows[1]).toMatchObject({ name: "Bob", state: "ATTENDED" });
    });

    it("pages with the (registered_at, id) keyset across two calls with no duplicates", async () => {
      const organizer = await user("Org10");
      const q = queries();
      const id = await event(organizer, {
        startsAt: new Date(Date.now() + HOUR),
      });
      const userIds: string[] = [];
      for (let i = 1; i <= 5; i += 1) {
        const u = await user(`Registrant ${i}`);
        userIds.push(u);
        await db.prisma.eventRegistration.create({
          data: {
            eventId: id,
            userId: u,
            state: "REGISTERED",
            registeredAt: new Date(Date.now() + i * 1000),
          },
        });
      }

      const first = await q.listRegistrants(id, { limit: 3 });
      expect(first).toHaveLength(3);
      const last = first.at(-1)!;
      const second = await q.listRegistrants(id, {
        limit: 3,
        after: {
          key: last.registeredAt.toISOString(),
          id: last.registrationId,
        },
      });

      const combined = [...first, ...second].map((r) => r.userId);
      expect(new Set(combined).size).toBe(5);
      expect(combined).toEqual(userIds);
    });

    it("only returns registrants for the given event", async () => {
      const organizer = await user("Org11");
      const other = await user("Other");
      const eventA = await event(organizer, {
        startsAt: new Date(Date.now() + HOUR),
      });
      const eventB = await event(organizer, {
        startsAt: new Date(Date.now() + HOUR),
      });
      await register(eventA, other, "REGISTERED");

      const rowsB = await queries().listRegistrants(eventB, { limit: 10 });
      expect(rowsB).toHaveLength(0);
    });
  });
});
