import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "@nitap/testing";

describe("notification schema constraints", () => {
  let db: TestDatabase;
  beforeEach(async () => {
    db = await createTestDatabase();
  });
  afterEach(async () => {
    await db.drop();
  });

  it("rejects a duplicate dedupeKey", async () => {
    const user = await db.prisma.user.create({
      data: { email: "a@nitap.ac.in", name: "A", emailVerified: true },
    });
    const row = {
      recipientId: user.id,
      type: "connection.requested",
      category: "ENGAGEMENT" as const,
      payload: {},
      dedupeKey: "dup-key-1",
    };
    await db.prisma.notification.create({ data: row });
    await expect(
      db.prisma.notification.create({ data: row })
    ).rejects.toThrow();
  });

  it("enforces one preference row per user/domain/channel", async () => {
    const user = await db.prisma.user.create({
      data: { email: "b@nitap.ac.in", name: "B", emailVerified: true },
    });
    const pref = {
      userId: user.id,
      domain: "CONNECTION" as const,
      channel: "EMAIL" as const,
      enabled: false,
    };
    await db.prisma.notificationPreference.create({ data: pref });
    await expect(
      db.prisma.notificationPreference.create({ data: pref })
    ).rejects.toThrow();
  });
});
