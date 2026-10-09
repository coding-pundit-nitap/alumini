import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createAuditWriter } from "@nitap/database/audit";
import { createOutboxWriter } from "@nitap/database/outbox";
import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { createTransactionRunner } from "@/infrastructure/database/transaction-runner";
import { AuthenticationError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";
import { createAddComment } from "@/modules/posts/application/add-comment";
import { createCreatePost } from "@/modules/posts/application/create-post";
import { createDeleteComment } from "@/modules/posts/application/delete-comment";
import { createDeletePost } from "@/modules/posts/application/delete-post";
import { createGetPost } from "@/modules/posts/application/get-post";
import { createGetPostImageKey } from "@/modules/posts/application/get-post-image-key";
import { createListComments } from "@/modules/posts/application/list-comments";
import { createListFeed } from "@/modules/posts/application/list-feed";
import { createReact } from "@/modules/posts/application/react";
import { createUnreact } from "@/modules/posts/application/unreact";
import { createUpdatePost } from "@/modules/posts/application/update-post";
import { createPrismaPostsStore } from "@/modules/posts/infrastructure/prisma-posts-store";

const actor = (userId: string): Actor => ({
  userId,
  accountState: "VERIFIED",
  requestId: "r",
  grants: [],
});

const authorize = (a: Actor | null) => {
  if (!a) throw new AuthenticationError();
  return a;
};

/** Resolves to the AppError code, or "ok". */
const code = (promise: Promise<unknown>) =>
  promise.then(
    () => "ok",
    (e: { code?: string }) => e.code ?? "error"
  );

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

/** `blocker` blocked `blocked` (the connection row stores the pair in canonical order). */
async function block(db: TestDatabase, blocker: string, blocked: string) {
  const [lo, hi] = [blocker, blocked].sort() as [string, string];
  await db.prisma.connection.create({
    data: {
      userAId: lo,
      userBId: hi,
      requestedById: lo,
      state: "BLOCKED",
      blockedById: blocker,
    },
  });
}

async function readyUpload(db: TestDatabase, ownerId: string) {
  const upload = await db.prisma.upload.create({
    data: {
      ownerId,
      purpose: "PROFILE_PHOTO",
      objectKey: `avatars/${ownerId}/x`,
      mime: "image/png",
      size: 100,
      status: "READY",
    },
  });
  return upload.id;
}

describe("posts use cases against real PostgreSQL", () => {
  let db: TestDatabase;
  let asha: string;
  let ravi: string;

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    [asha, ravi] = [await member(db, "Asha"), await member(db, "Ravi")];
  });
  afterEach(async () => {
    await db.drop();
  });

  function build() {
    const store = createPrismaPostsStore({
      runner: createTransactionRunner(db.prisma),
      outbox: createOutboxWriter(),
      audit: createAuditWriter(),
    });
    const deps = { store, authorize };
    return {
      createPost: createCreatePost(deps),
      deletePost: createDeletePost(deps),
      updatePost: createUpdatePost(deps),
      listFeed: createListFeed(deps),
      getPost: createGetPost(deps),
      getPostImageKey: createGetPostImageKey(deps),
      addComment: createAddComment(deps),
      deleteComment: createDeleteComment(deps),
      listComments: createListComments(deps),
      react: createReact(deps),
      unreact: createUnreact(deps),
    };
  }
  const events = (type: string) =>
    db.prisma.outboxEvent.findMany({ where: { type } });

  describe("create-post", () => {
    it("creates a TEXT post and enqueues post.created", async () => {
      const m = build();
      const { postId } = await m.createPost({
        actor: actor(asha),
        input: { content: "hello world" },
      });
      const post = await db.prisma.post.findUniqueOrThrow({
        where: { id: postId },
      });
      expect(post.postType).toBe("TEXT");
      expect(post.authorId).toBe(asha);
      const [event] = await events("post.created");
      expect(event?.payload).toEqual({ v: 1, postId, authorId: asha });
    });

    it("accepts a READY upload owned by the caller as an image and refuses one that isn't", async () => {
      const m = build();
      const ready = await readyUpload(db, asha);
      const { postId } = await m.createPost({
        actor: actor(asha),
        input: { content: "with image", imageUrls: [ready] },
      });
      expect(
        (await db.prisma.post.findUniqueOrThrow({ where: { id: postId } }))
          .imageUrls
      ).toEqual([ready]);

      const notOwned = await readyUpload(db, ravi);
      expect(
        await code(
          m.createPost({
            actor: actor(asha),
            input: { content: "bad", imageUrls: [notOwned] },
          })
        )
      ).toBe("UPLOAD_NOT_READY");
    });

    it("requires a signed-in actor and valid input", async () => {
      const m = build();
      expect(
        await code(m.createPost({ actor: null, input: { content: "x" } }))
      ).toBe("UNAUTHENTICATED");
      expect(
        await code(m.createPost({ actor: actor(asha), input: { content: "" } }))
      ).toBe("VALIDATION_FAILED");
    });
  });

  describe("delete-post", () => {
    it("soft-deletes the author's own post, which then vanishes from the feed", async () => {
      const m = build();
      const { postId } = await m.createPost({
        actor: actor(asha),
        input: { content: "bye" },
      });
      await m.deletePost({ actor: actor(asha), postId });
      const post = await db.prisma.post.findUniqueOrThrow({
        where: { id: postId },
      });
      expect(post.deleted).toBe(true);
      expect(post.content).toBe("bye");
      const { posts } = await m.listFeed({ actor: actor(asha) });
      expect(posts.find((p) => p.id === postId)).toBeUndefined();
    });

    it("refuses a non-author with NOT_OWNER and a missing/already-deleted post with NOT_FOUND", async () => {
      const m = build();
      const { postId } = await m.createPost({
        actor: actor(asha),
        input: { content: "mine" },
      });
      expect(await code(m.deletePost({ actor: actor(ravi), postId }))).toBe(
        "NOT_OWNER"
      );
      await m.deletePost({ actor: actor(asha), postId });
      expect(await code(m.deletePost({ actor: actor(asha), postId }))).toBe(
        "NOT_FOUND"
      );
    });
  });

  describe("update-post", () => {
    it("replaces the author's own text and stamps editedAt, visible in the feed", async () => {
      const m = build();
      const { postId } = await m.createPost({
        actor: actor(asha),
        input: { content: "first draft" },
      });
      await m.updatePost({
        actor: actor(asha),
        postId,
        input: { content: "  second draft  " },
      });
      const post = await db.prisma.post.findUniqueOrThrow({
        where: { id: postId },
      });
      expect(post.content).toBe("second draft");
      expect(post.editedAt).toBeInstanceOf(Date);
      const { posts } = await m.listFeed({ actor: actor(ravi) });
      const seen = posts.find((p) => p.id === postId);
      expect(seen?.content).toBe("second draft");
      expect(seen?.editedAt).toBeInstanceOf(Date);
    });

    it("leaves editedAt unset when the text did not change", async () => {
      const m = build();
      const { postId } = await m.createPost({
        actor: actor(asha),
        input: { content: "same" },
      });
      await m.updatePost({
        actor: actor(asha),
        postId,
        input: { content: "same" },
      });
      expect(
        (await db.prisma.post.findUniqueOrThrow({ where: { id: postId } }))
          .editedAt
      ).toBeNull();
    });

    it("refuses a non-author, a deleted post, other post types and invalid input", async () => {
      const m = build();
      const { postId } = await m.createPost({
        actor: actor(asha),
        input: { content: "mine" },
      });
      const edit = (by: string, id: string, content: unknown = "changed") =>
        code(
          m.updatePost({ actor: actor(by), postId: id, input: { content } })
        );

      expect(await edit(ravi, postId)).toBe("NOT_OWNER");
      expect(
        await code(
          m.updatePost({ actor: null, postId, input: { content: "x" } })
        )
      ).toBe("UNAUTHENTICATED");
      expect(await edit(asha, postId, "")).toBe("VALIDATION_FAILED");
      expect(
        await code(
          m.updatePost({
            actor: actor(asha),
            postId,
            input: { content: "x", linkUrl: "https://example.test" },
          })
        )
      ).toBe("VALIDATION_FAILED");

      const achievement = await db.prisma.post.create({
        data: { authorId: asha, content: "Award", postType: "ACHIEVEMENT" },
      });
      expect(await edit(asha, achievement.id)).toBe("NOT_FOUND");

      await m.deletePost({ actor: actor(asha), postId });
      expect(await edit(asha, postId)).toBe("NOT_FOUND");
      expect(
        (await db.prisma.post.findUniqueOrThrow({ where: { id: postId } }))
          .content
      ).toBe("mine");
    });

    it("refuses an edit while a report against the post is open, and allows it once decided", async () => {
      const m = build();
      const { postId } = await m.createPost({
        actor: actor(asha),
        input: { content: "reported text" },
      });
      const report = await db.prisma.report.create({
        data: {
          reporterId: ravi,
          targetType: "POST",
          targetId: postId,
          reason: "spam",
        },
      });
      const edit = () =>
        code(
          m.updatePost({
            actor: actor(asha),
            postId,
            input: { content: "cleaned up" },
          })
        );
      expect(await edit()).toBe("POST_UNDER_REVIEW");
      expect(
        (await db.prisma.post.findUniqueOrThrow({ where: { id: postId } }))
          .content
      ).toBe("reported text");

      await db.prisma.report.update({
        where: { id: report.id },
        data: {
          status: "DISMISSED",
          resolvedById: await member(db, "Moderator"),
        },
      });
      expect(await edit()).toBe("ok");
    });
  });

  describe("list-feed", () => {
    it("pages newest first and excludes deleted posts", async () => {
      const m = build();
      const ids: string[] = [];
      for (let i = 0; i < 3; i += 1) {
        ids.push(
          (
            await m.createPost({
              actor: actor(asha),
              input: { content: `p${i}` },
            })
          ).postId
        );
      }
      await m.deletePost({ actor: actor(asha), postId: ids[1]! });

      const first = await m.listFeed({ actor: actor(asha), limit: 1 });
      expect(first.posts).toHaveLength(1);
      expect(first.posts[0]?.id).toBe(ids[2]);
      expect(first.nextCursor).not.toBeNull();

      const second = await m.listFeed({
        actor: actor(asha),
        limit: 1,
        cursor: first.nextCursor!,
      });
      expect(second.posts.map((p) => p.id)).toEqual([ids[0]]);
      expect(second.nextCursor).toBeNull();
    });

    it("requires a signed-in actor", async () => {
      expect(await code(build().listFeed({ actor: null }))).toBe(
        "UNAUTHENTICATED"
      );
    });

    it("myReaction reflects the calling actor, not some other viewer", async () => {
      const m = build();
      const { postId } = await m.createPost({
        actor: actor(asha),
        input: { content: "post" },
      });
      await m.react({
        actor: actor(ravi),
        postId,
        input: { type: "LIKE" },
      });

      const asAsha = await m.listFeed({ actor: actor(asha) });
      expect(asAsha.posts.find((p) => p.id === postId)?.myReaction).toBeNull();

      const asRavi = await m.listFeed({ actor: actor(ravi) });
      expect(asRavi.posts.find((p) => p.id === postId)?.myReaction).toBe(
        "LIKE"
      );
    });
  });

  describe("get-post / get-post-image-key", () => {
    it("returns the post with its author", async () => {
      const m = build();
      const { postId } = await m.createPost({
        actor: actor(asha),
        input: { content: "hello" },
      });
      const post = await m.getPost({ actor: actor(ravi), postId });
      expect(post.id).toBe(postId);
      expect(post.author).toEqual({
        id: asha,
        fullName: "Asha",
        headline: null,
        hasPhoto: false,
      });
    });

    it("throws NotFoundError for a deleted post and for a random uuid", async () => {
      const m = build();
      const { postId } = await m.createPost({
        actor: actor(asha),
        input: { content: "gone" },
      });
      await m.deletePost({ actor: actor(asha), postId });
      expect(await code(m.getPost({ actor: actor(ravi), postId }))).toBe(
        "NOT_FOUND"
      );
      expect(
        await code(
          m.getPost({
            actor: actor(ravi),
            postId: "00000000-0000-4000-8000-000000000000",
          })
        )
      ).toBe("NOT_FOUND");
    });

    it("throws NotFoundError for an upload no live post references", async () => {
      const m = build();
      const upload = await readyUpload(db, asha);
      expect(
        await code(m.getPostImageKey({ actor: actor(asha), uploadId: upload }))
      ).toBe("NOT_FOUND");
    });
  });

  describe("add-comment / list-comments / delete-comment", () => {
    it("adds a comment that appears in listComments and enqueues comment.created", async () => {
      const m = build();
      const { postId } = await m.createPost({
        actor: actor(asha),
        input: { content: "post" },
      });
      const comment = await m.addComment({
        actor: actor(ravi),
        postId,
        input: { body: "nice!" },
      });
      const { comments } = await m.listComments({
        actor: actor(asha),
        postId,
      });
      expect(comments.map((c) => c.id)).toEqual([comment.id]);
      const [event] = await events("comment.created");
      expect(event?.payload).toEqual({
        v: 1,
        commentId: comment.id,
        postId,
        authorId: ravi,
      });
    });

    it("refuses a comment on a deleted post and across a block, both as NOT_FOUND", async () => {
      const m = build();
      const { postId } = await m.createPost({
        actor: actor(asha),
        input: { content: "post" },
      });
      await block(db, asha, ravi);
      expect(
        await code(
          m.addComment({
            actor: actor(ravi),
            postId,
            input: { body: "hi" },
          })
        )
      ).toBe("NOT_FOUND");

      const other = await member(db, "Meera");
      const { postId: deletedPostId } = await m.createPost({
        actor: actor(asha),
        input: { content: "gone" },
      });
      await m.deletePost({ actor: actor(asha), postId: deletedPostId });
      expect(
        await code(
          m.addComment({
            actor: actor(other),
            postId: deletedPostId,
            input: { body: "hi" },
          })
        )
      ).toBe("NOT_FOUND");
    });

    it("lets the comment's author soft-delete it, refusing everyone else", async () => {
      const m = build();
      const { postId } = await m.createPost({
        actor: actor(asha),
        input: { content: "post" },
      });
      const comment = await m.addComment({
        actor: actor(ravi),
        postId,
        input: { body: "mine" },
      });
      expect(
        await code(
          m.deleteComment({ actor: actor(asha), commentId: comment.id })
        )
      ).toBe("NOT_OWNER");
      await m.deleteComment({ actor: actor(ravi), commentId: comment.id });
      const { comments } = await m.listComments({
        actor: actor(asha),
        postId,
      });
      expect(comments).toHaveLength(0);
    });
  });

  describe("react / unreact", () => {
    it("reacting again replaces the type; unreact removes the row", async () => {
      const m = build();
      const { postId } = await m.createPost({
        actor: actor(asha),
        input: { content: "post" },
      });
      await m.react({
        actor: actor(ravi),
        postId,
        input: { type: "LIKE" },
      });
      await m.react({
        actor: actor(ravi),
        postId,
        input: { type: "CELEBRATE" },
      });
      const rows = await db.prisma.reaction.findMany({
        where: { postId, userId: ravi },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.type).toBe("CELEBRATE");
      const event = (await events("reaction.added")).at(-1);
      expect(event?.payload).toEqual({
        v: 1,
        postId,
        userId: ravi,
        type: "CELEBRATE",
      });

      await m.unreact({ actor: actor(ravi), postId });
      expect(
        await db.prisma.reaction.count({ where: { postId, userId: ravi } })
      ).toBe(0);
    });

    it("refuses reacting across a block or to a deleted post, both as NOT_FOUND", async () => {
      const m = build();
      const { postId } = await m.createPost({
        actor: actor(asha),
        input: { content: "post" },
      });
      await block(db, asha, ravi);
      expect(
        await code(
          m.react({ actor: actor(ravi), postId, input: { type: "LIKE" } })
        )
      ).toBe("NOT_FOUND");

      const other = await member(db, "Kiran");
      await m.deletePost({ actor: actor(asha), postId });
      expect(
        await code(
          m.react({ actor: actor(other), postId, input: { type: "LIKE" } })
        )
      ).toBe("NOT_FOUND");
    });
  });
});
