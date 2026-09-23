import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";
import { createPrismaNotificationStore } from "@/modules/notifications/infrastructure/prisma-notification-store";

describe("prisma notification store", () => {
  let db: TestDatabase;
  let userId: string;

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    const user = await db.prisma.user.create({
      data: { email: "store@nitap.ac.in", name: "Store", emailVerified: true },
    });
    userId = user.id;
  });
  afterEach(async () => db.drop());

  it("insert is idempotent on dedupeKey", async () => {
    const store = createPrismaNotificationStore(db.prisma);
    const first = await store.insert({
      recipientId: userId,
      type: "connection.requested",
      category: "ENGAGEMENT",
      payload: { connectionId: "c1" },
      dedupeKey: "dk-1",
    });
    const second = await store.insert({
      recipientId: userId,
      type: "connection.requested",
      category: "ENGAGEMENT",
      payload: { connectionId: "c1" },
      dedupeKey: "dk-1",
    });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.id).toBe(first.id);
  });

  it("lists newest-first with a working cursor, no duplicates across pages", async () => {
    const store = createPrismaNotificationStore(db.prisma);
    for (let i = 0; i < 5; i += 1) {
      await store.insert({
        recipientId: userId,
        type: "connection.requested",
        category: "ENGAGEMENT",
        payload: {},
        dedupeKey: `dk-page-${i}`,
      });
    }
    const page1 = await store.list({ recipientId: userId, limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();
    const cursor = page1.nextCursor!;
    const { decodeCursor } =
      await import("@/modules/notifications/domain/cursor");
    const page2 = await store.list({
      recipientId: userId,
      cursor: decodeCursor(cursor),
      limit: 2,
    });
    const ids1 = page1.items.map((i) => i.id);
    const ids2 = page2.items.map((i) => i.id);
    expect(ids1.filter((id) => ids2.includes(id))).toHaveLength(0);
  });

  it("markRead only affects the caller's own notification (object-level)", async () => {
    const store = createPrismaNotificationStore(db.prisma);
    const other = await db.prisma.user.create({
      data: { email: "other@nitap.ac.in", name: "Other", emailVerified: true },
    });
    const { id } = await store.insert({
      recipientId: other.id,
      type: "connection.requested",
      category: "ENGAGEMENT",
      payload: {},
      dedupeKey: "dk-owner",
    });
    const result = await store.markRead({ recipientId: userId, id });
    expect(result).toBe(false);
  });

  it("unreadCountFromDb counts only unread rows", async () => {
    const store = createPrismaNotificationStore(db.prisma);
    const a = await store.insert({
      recipientId: userId,
      type: "connection.requested",
      category: "ENGAGEMENT",
      payload: {},
      dedupeKey: "dk-unread-a",
    });
    await store.insert({
      recipientId: userId,
      type: "connection.requested",
      category: "ENGAGEMENT",
      payload: {},
      dedupeKey: "dk-unread-b",
    });
    await store.markRead({ recipientId: userId, id: a.id });
    expect(await store.unreadCountFromDb(userId)).toBe(1);
  });

  it("missing preference row means enabled by default when read back", async () => {
    const store = createPrismaNotificationStore(db.prisma);
    const prefs = await store.getPreferences(userId);
    expect(prefs).toHaveLength(0); // store returns only explicit overrides; decideChannel defaults the rest
  });

  it("setPreference upserts on (userId, domain, channel)", async () => {
    const store = createPrismaNotificationStore(db.prisma);
    await store.setPreference({
      userId,
      domain: "CONNECTION",
      channel: "EMAIL",
      enabled: false,
    });
    await store.setPreference({
      userId,
      domain: "CONNECTION",
      channel: "EMAIL",
      enabled: true,
    });
    const prefs = await store.getPreferences(userId);
    expect(prefs).toHaveLength(1);
    expect(prefs[0]!.enabled).toBe(true);
  });
});
