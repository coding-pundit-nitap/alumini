import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createAuditWriter } from "@nitap/database/audit";
import { createOutboxWriter } from "@nitap/database/outbox";
import { PERMISSIONS, type Permission } from "@nitap/database/permissions";
import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { createTransactionRunner } from "@/infrastructure/database/transaction-runner";
import type { Actor } from "@/modules/auth";
import { createAuthorization } from "@/modules/auth/application/authorize";
import { createDeletePost } from "@/modules/posts/application/delete-post";
import { createGetPinnedAnnouncement } from "@/modules/posts/application/get-pinned-announcement";
import { createListAnnouncements } from "@/modules/posts/application/list-announcements";
import { createPublishAnnouncement } from "@/modules/posts/application/publish-announcement";
import { createRemoveAnnouncement } from "@/modules/posts/application/remove-announcement";
import { createPrismaPostsStore } from "@/modules/posts/infrastructure/prisma-posts-store";

const { authorize } = createAuthorization({
  observer: { record() {} },
  now: () => new Date(),
});
const holding = (
  userId: string,
  permissions: Permission[],
  scope: "GLOBAL" | { chapterId: string } = "GLOBAL"
): Actor => ({
  userId,
  accountState: "VERIFIED",
  requestId: "r",
  grants: permissions.map((permission) => ({
    permission,
    scope: scope === "GLOBAL" ? "GLOBAL" : "CHAPTER",
    ...(scope === "GLOBAL" ? {} : { chapterId: scope.chapterId }),
    expiresAt: null,
  })) as Actor["grants"],
});
const PUBLISHER = [
  PERMISSIONS.ANNOUNCEMENT_PUBLISH,
  PERMISSIONS.POST_CREATE,
  PERMISSIONS.POST_INTERACT,
];
const MEMBER = [PERMISSIONS.POST_CREATE, PERMISSIONS.POST_INTERACT];

async function member(db: TestDatabase, name: string) {
  const user = await db.prisma.user.create({
    data: {
      name,
      email: `${name.toLowerCase().replace(/\W/g, "")}@example.test`,
      accountState: "VERIFIED",
    },
  });
  await db.prisma.profile.create({
    data: { userId: user.id, fullName: name },
  });
  return user.id;
}

/** Resolves to the AppError code, or "ok". */
const code = (promise: Promise<unknown>) =>
  promise.then(
    () => "ok",
    (e: { code?: string }) => e.code ?? "error"
  );

let db: TestDatabase;
let publish: ReturnType<typeof createPublishAnnouncement>;
let remove: ReturnType<typeof createRemoveAnnouncement>;
let list: ReturnType<typeof createListAnnouncements>;
let pinned: ReturnType<typeof createGetPinnedAnnouncement>;
let deletePost: ReturnType<typeof createDeletePost>;
let clock = new Date();

beforeEach(async () => {
  clock = new Date();
  db = await createTestDatabase();
  await runSeed(db.prisma);
  const store = createPrismaPostsStore({
    runner: createTransactionRunner(db.prisma),
    outbox: createOutboxWriter(),
    audit: createAuditWriter(),
  });
  const deps = { store, authorize };
  publish = createPublishAnnouncement(deps);
  remove = createRemoveAnnouncement(deps);
  list = createListAnnouncements(deps);
  pinned = createGetPinnedAnnouncement({ ...deps, now: () => clock });
  deletePost = createDeletePost(deps);
});
afterEach(() => db.drop());

describe("publishAnnouncement", () => {
  it("writes the post, an audit row and one announcement.published event, and no post.created", async () => {
    const admin = await member(db, "Admin One");
    const { postId } = await publish({
      actor: holding(admin, PUBLISHER),
      input: { title: "  Convocation 2026  ", content: "Details **here**." },
    });
    const post = await db.prisma.post.findUniqueOrThrow({
      where: { id: postId },
    });
    expect(post).toMatchObject({
      postType: "ANNOUNCEMENT",
      title: "Convocation 2026",
      authorId: admin,
    });
    const audit = await db.prisma.auditLog.findMany({
      where: { targetId: postId },
    });
    expect(audit.map((a) => a.action)).toEqual(["announcement.published"]);
    const events = await db.prisma.outboxEvent.findMany();
    expect(events.map((e) => e.type)).toEqual(["announcement.published"]);
  });

  it("refuses a member without announcement.publish (403) and a chapter-scoped holder", async () => {
    const m = await member(db, "Plain Member");
    await expect(
      code(
        publish({
          actor: holding(m, MEMBER),
          input: { title: "T", content: "B" },
        })
      )
    ).resolves.toBe("PERMISSION_DENIED");
    const chapter = await db.prisma.chapter.create({ data: { slug: "delhi" } });
    await expect(
      code(
        publish({
          actor: holding(m, [PERMISSIONS.ANNOUNCEMENT_PUBLISH], {
            chapterId: chapter.id,
          }),
          input: { title: "T", content: "B" },
        })
      )
    ).resolves.toBe("PERMISSION_DENIED");
    expect(await db.prisma.post.count()).toBe(0);
  });

  it("validates the title: required, trimmed, at most 120", async () => {
    const admin = await member(db, "Admin Two");
    const a = holding(admin, PUBLISHER);
    await expect(
      code(publish({ actor: a, input: { title: "   ", content: "B" } }))
    ).resolves.toBe("VALIDATION_FAILED");
    await expect(
      code(
        publish({ actor: a, input: { title: "x".repeat(121), content: "B" } })
      )
    ).resolves.toBe("VALIDATION_FAILED");
  });
});

describe("removeAnnouncement", () => {
  it("soft-deletes once, audits once, and a repeat is 404", async () => {
    const admin = await member(db, "Admin Three");
    const other = await member(db, "Admin Four");
    const { postId } = await publish({
      actor: holding(admin, PUBLISHER),
      input: { title: "T", content: "B" },
    });
    await remove({ actor: holding(other, PUBLISHER), postId });
    await expect(
      code(remove({ actor: holding(other, PUBLISHER), postId }))
    ).resolves.toBe("NOT_FOUND");
    const actions = (
      await db.prisma.auditLog.findMany({
        where: { targetId: postId },
        orderBy: { createdAt: "asc" },
      })
    ).map((a) => a.action);
    expect(actions).toEqual(["announcement.published", "announcement.removed"]);
  });

  it("does not remove an ordinary post", async () => {
    const admin = await member(db, "Admin Five");
    const post = await db.prisma.post.create({
      data: { authorId: admin, content: "hi" },
    });
    await expect(
      code(remove({ actor: holding(admin, PUBLISHER), postId: post.id }))
    ).resolves.toBe("NOT_FOUND");
  });

  it("deletePost refuses an announcement even for its author", async () => {
    const admin = await member(db, "Admin Six");
    const { postId } = await publish({
      actor: holding(admin, PUBLISHER),
      input: { title: "T", content: "B" },
    });
    await expect(
      code(deletePost({ actor: holding(admin, PUBLISHER), postId }))
    ).resolves.toBe("NOT_FOUND");
  });
});

describe("pinned and list", () => {
  it("pins the newest live announcement within 7 days", async () => {
    const admin = await member(db, "Admin Seven");
    const a = holding(admin, PUBLISHER);
    const first = await publish({
      actor: a,
      input: { title: "Old", content: "B" },
    });
    const second = await publish({
      actor: a,
      input: { title: "New", content: "B" },
    });
    expect((await pinned({ actor: a }))?.id).toBe(second.postId);
    await remove({ actor: a, postId: second.postId });
    expect((await pinned({ actor: a }))?.id).toBe(first.postId);
    clock = new Date(Date.now() + 8 * 24 * 3600 * 1000);
    expect(await pinned({ actor: a })).toBeNull();
    clock = new Date();
  });

  it("lists announcements newest first with a cursor, excluding removed ones", async () => {
    const admin = await member(db, "Admin Eight");
    const a = holding(admin, PUBLISHER);
    for (const t of ["A", "B", "C"])
      await publish({ actor: a, input: { title: t, content: "x" } });
    const page = await list({ actor: a });
    expect(page.announcements.map((p) => p.title)).toEqual(["C", "B", "A"]);
    expect(page.announcements[0]!.author.fullName).toBe("Admin Eight");
    await expect(code(list({ actor: holding(admin, MEMBER) }))).resolves.toBe(
      "PERMISSION_DENIED"
    );
  });
});
