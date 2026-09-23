import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createNotificationRetentionStore } from "@nitap/database/notifications";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

describe("notification retention store (real Postgres)", () => {
  let db: TestDatabase;
  const store = createNotificationRetentionStore();
  beforeEach(async () => {
    db = await createTestDatabase();
  });
  afterEach(async () => {
    await db.drop();
  });

  async function seed() {
    const user = await db.prisma.user.create({
      data: { email: "r@nitap.ac.in", name: "R", emailVerified: true },
    });
    const make = (key: string, readAt: Date | null, createdAt: Date) =>
      db.prisma.notification.create({
        data: {
          recipientId: user.id,
          type: "connection.requested",
          category: "ENGAGEMENT",
          payload: {},
          dedupeKey: key,
          readAt,
          createdAt,
        },
      });
    const unreadOld = await make("a", null, ago(100));
    const readOld = await make("b", ago(100), ago(100));
    const readRecently = await make("c", ago(1), ago(200));
    await db.prisma.notificationDelivery.create({
      data: { notificationId: readOld.id, channel: "EMAIL" },
    });
    return { unreadOld, readOld, readRecently };
  }

  it("deletes only old read rows, cascades deliveries, and is re-runnable", async () => {
    const { unreadOld, readOld, readRecently } = await seed();
    const before = ago(90);

    expect(await store.sweep(db.prisma, before, 500)).toBe(1);
    const left = await db.prisma.notification.findMany({
      select: { id: true },
    });
    expect(left.map((r) => r.id).sort()).toEqual(
      [unreadOld.id, readRecently.id].sort()
    );
    expect(
      await db.prisma.notificationDelivery.count({
        where: { notificationId: readOld.id },
      })
    ).toBe(0);
    expect(await store.sweep(db.prisma, before, 500)).toBe(0);
  });

  it("terminates with a batch smaller than the candidate count", async () => {
    const user = await db.prisma.user.create({
      data: { email: "s@nitap.ac.in", name: "S", emailVerified: true },
    });
    await db.prisma.notification.createMany({
      data: Array.from({ length: 5 }, (_, i) => ({
        recipientId: user.id,
        type: "connection.requested",
        category: "ENGAGEMENT" as const,
        payload: {},
        dedupeKey: `k${i}`,
        readAt: ago(100 + i),
      })),
    });
    let total = 0;
    for (;;) {
      const n = await store.sweep(db.prisma, ago(90), 2);
      total += n;
      if (n < 2) break;
    }
    expect(total).toBe(5);
    expect(await db.prisma.notification.count()).toBe(0);
  });
});
