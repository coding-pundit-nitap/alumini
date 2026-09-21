import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runSeed } from "@nitap/database/seed";
import {
  createTestDatabase,
  expectConstraintViolation,
  type TestDatabase,
} from "@nitap/testing";

describe("mentorship table (real PostgreSQL)", () => {
  let db: TestDatabase;
  let m: string;
  let s: string;

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    const users = await Promise.all(
      ["mentor", "mentee"].map((name) =>
        db.prisma.user.create({ data: { name, email: `${name}@example.test` } })
      )
    );
    [m, s] = users.map((u) => u.id) as [string, string];
  });
  afterEach(async () => {
    await db.drop();
  });

  const row = (over: Record<string, unknown> = {}) => ({
    mentorId: m,
    menteeId: s,
    message: "Would love your guidance",
    ...over,
  });
  const violation = (data: Record<string, unknown>) =>
    db.prisma.mentorship.create({ data: data as never }).catch((e) => e);

  it("accepts a normal request", async () => {
    const created = await db.prisma.mentorship.create({ data: row() });
    expect(created).toMatchObject({ state: "REQUESTED", respondedAt: null });
  });

  it("prevents mentor and mentee being the same user (ck_mentorship_distinct)", async () => {
    expectConstraintViolation(
      await violation(row({ mentorId: m, menteeId: m })),
      "ck_mentorship_distinct"
    );
  });

  it("bounds message length (ck_mentorship_message)", async () => {
    expectConstraintViolation(
      await violation(row({ message: "" })),
      "ck_mentorship_message"
    );
    expectConstraintViolation(
      await violation(row({ message: "x".repeat(501) })),
      "ck_mentorship_message"
    );
  });

  it("bounds responseNote length (ck_mentorship_note)", async () => {
    expectConstraintViolation(
      await violation(row({ responseNote: "x".repeat(501) })),
      "ck_mentorship_note"
    );
  });

  it("bounds topic length (ck_mentorship_topic)", async () => {
    expectConstraintViolation(
      await violation(row({ topic: "" })),
      "ck_mentorship_topic"
    );
  });

  it("requires responded_at on ACCEPTED/ACTIVE/COMPLETED/DECLINED (ck_mentorship_responded)", async () => {
    const now = new Date();
    // Other required timestamps are supplied so only responded_at is under test.
    const overrides: Record<string, Record<string, unknown>> = {
      ACCEPTED: {},
      ACTIVE: { startedAt: now },
      COMPLETED: { startedAt: now, endedAt: now },
      DECLINED: { endedAt: now },
    };
    for (const state of ["ACCEPTED", "ACTIVE", "COMPLETED", "DECLINED"]) {
      expectConstraintViolation(
        await violation(row({ state, ...overrides[state] })),
        "ck_mentorship_responded"
      );
    }
  });

  it("requires started_at on ACTIVE with responded_at set (ck_mentorship_started)", async () => {
    expectConstraintViolation(
      await violation(row({ state: "ACTIVE", respondedAt: new Date() })),
      "ck_mentorship_started"
    );
  });

  it("requires ended_at on CANCELLED/DECLINED/COMPLETED (ck_mentorship_ended)", async () => {
    expectConstraintViolation(
      await violation(row({ state: "CANCELLED" })),
      "ck_mentorship_ended"
    );
    expectConstraintViolation(
      await violation(row({ state: "DECLINED", respondedAt: new Date() })),
      "ck_mentorship_ended"
    );
    expectConstraintViolation(
      await violation(
        row({
          state: "COMPLETED",
          respondedAt: new Date(),
          startedAt: new Date(),
        })
      ),
      "ck_mentorship_ended"
    );
  });

  it("forbids ended_at while still open (ck_mentorship_open_unended)", async () => {
    expectConstraintViolation(
      await violation(row({ state: "REQUESTED", endedAt: new Date() })),
      "ck_mentorship_open_unended"
    );
  });

  it("prevents a second OPEN row for the same pair (uq_mentorship_open_pair)", async () => {
    await db.prisma.mentorship.create({ data: row() });
    expectConstraintViolation(
      await violation(row()),
      "uq_mentorship_open_pair"
    );
  });

  it("allows a new REQUESTED row for a pair whose prior row is terminal (DECLINED)", async () => {
    const now = new Date();
    await db.prisma.mentorship.create({
      data: row({ state: "DECLINED", respondedAt: now, endedAt: now }),
    });
    const second = await db.prisma.mentorship.create({ data: row() });
    expect(second.state).toBe("REQUESTED");
  });

  it("allows an OPEN row for the reversed pair (mentor and mentee swapped)", async () => {
    await db.prisma.mentorship.create({ data: row() });
    const reversed = await db.prisma.mentorship.create({
      data: row({ mentorId: s, menteeId: m }),
    });
    expect(reversed.state).toBe("REQUESTED");
  });

  it("deletes the row when the mentee user is deleted (cascade)", async () => {
    await db.prisma.mentorship.create({ data: row() });
    await db.prisma.user.delete({ where: { id: s } });
    expect(await db.prisma.mentorship.count()).toBe(0);
  });
});
