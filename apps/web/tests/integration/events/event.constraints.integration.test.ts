import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createTestDatabase,
  expectConstraintViolation,
  type TestDatabase,
} from "@nitap/testing";

const HOUR = 60 * 60 * 1000;

describe("event and event_registration tables (real PostgreSQL)", () => {
  let db: TestDatabase;
  let organizer: string;
  let member: string;

  beforeEach(async () => {
    db = await createTestDatabase();
    const users = await Promise.all(
      ["organizer", "member"].map((name) =>
        db.prisma.user.create({ data: { name, email: `${name}@example.test` } })
      )
    );
    [organizer, member] = users.map((u) => u.id) as [string, string];
  });
  afterEach(async () => {
    await db.drop();
  });

  const event = (over: Record<string, unknown> = {}) => ({
    organizerId: organizer,
    title: "Chapter meetup",
    description: "An evening with the alumni chapter.",
    startsAt: new Date(Date.now() + 48 * HOUR),
    timezone: "Asia/Kolkata",
    location: "Bengaluru",
    isOnline: false,
    capacity: 10,
    registrationDeadline: new Date(Date.now() + 24 * HOUR),
    ...over,
  });
  const violation = (data: Record<string, unknown>) =>
    db.prisma.event.create({ data: data as never }).catch((e: unknown) => e);

  it("accepts a normal event, SCHEDULED with no registrations", async () => {
    const created = await db.prisma.event.create({ data: event() });
    expect(created).toMatchObject({
      status: "SCHEDULED",
      registeredCount: 0,
      cancelledAt: null,
    });
  });

  it("accepts an online event without a location", async () => {
    await expect(
      db.prisma.event.create({
        data: event({ isOnline: true, location: null }),
      })
    ).resolves.toBeDefined();
  });

  it.each([
    ["ck_event_title", { title: "ab" }],
    ["ck_event_title", { title: "x".repeat(151) }],
    ["ck_event_description", { description: "too short" }],
    ["ck_event_location", { isOnline: false, location: null }],
    ["ck_event_location_length", { location: "" }],
    ["ck_event_capacity", { capacity: 0 }],
    ["ck_event_capacity", { capacity: 100_001 }],
    ["ck_event_registered_count", { capacity: 5, registeredCount: 6 }],
    ["ck_event_registered_count", { registeredCount: -1 }],
    [
      "ck_event_deadline",
      {
        startsAt: new Date(Date.now() + HOUR),
        registrationDeadline: new Date(Date.now() + 2 * HOUR),
      },
    ],
    ["ck_event_cancelled", { status: "CANCELLED" }],
    ["ck_event_cancelled", { cancelledAt: new Date() }],
  ])("rejects a row violating %s", async (constraint, over) => {
    expectConstraintViolation(await violation(event(over)), constraint);
  });

  it("allows the deadline to equal the start", async () => {
    const at = new Date(Date.now() + HOUR);
    await expect(
      db.prisma.event.create({
        data: event({ startsAt: at, registrationDeadline: at }),
      })
    ).resolves.toBeDefined();
  });

  it("keeps one registration row per (user, event) (uq_event_registration)", async () => {
    const { id: eventId } = await db.prisma.event.create({ data: event() });
    await db.prisma.eventRegistration.create({
      data: { eventId, userId: member },
    });
    expectConstraintViolation(
      await db.prisma.eventRegistration
        .create({ data: { eventId, userId: member, state: "CANCELLED" } })
        .catch((e: unknown) => e),
      "uq_event_registration"
    );
  });

  it("the counter can never pass capacity, even through a raw increment", async () => {
    const { id } = await db.prisma.event.create({
      data: event({ capacity: 1, registeredCount: 1 }),
    });
    const error = await db.prisma
      .$executeRaw`UPDATE event SET registered_count = registered_count + 1 WHERE id = ${id}::uuid`.catch(
      (e: unknown) => e
    );
    expectConstraintViolation(error, "ck_event_registered_count");
  });
});
