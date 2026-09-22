// apps/web/tests/security/community.security.integration.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createOutboxWriter } from "@nitap/database/outbox";
import { runSeed } from "@nitap/database/seed";
import type { RoleName } from "@nitap/database/role-permissions";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { createTransactionRunner } from "@/infrastructure/database/transaction-runner";
import type { Actor } from "@/modules/auth";
import { createAuthorization } from "@/modules/auth/application/authorize";
import { resolveActor } from "@/modules/auth/application/resolve-actor";
import { createPrismaGrantSource } from "@/modules/auth/infrastructure/prisma-grant-source";

import { createReviewAchievement } from "@/modules/achievements/application/review-achievement";
import { createSubmitAchievement } from "@/modules/achievements/application/submit-achievement";
import { createWithdrawAchievement } from "@/modules/achievements/application/withdraw-achievement";
import { createPrismaAchievementsStore } from "@/modules/achievements/infrastructure/prisma-achievements-store";

import { createClaimReport } from "@/modules/moderation/application/claim-report";
import { createDismissReport } from "@/modules/moderation/application/dismiss-report";
import { createFileContentReport } from "@/modules/moderation/application/file-content-report";
import { createResolveReport } from "@/modules/moderation/application/resolve-report";
import { createPrismaModerationStore } from "@/modules/moderation/infrastructure/prisma-moderation-store";

import { createAddComment } from "@/modules/posts/application/add-comment";
import { createCreatePost } from "@/modules/posts/application/create-post";
import { createDeleteComment } from "@/modules/posts/application/delete-comment";
import { createDeletePost } from "@/modules/posts/application/delete-post";
import { createListComments } from "@/modules/posts/application/list-comments";
import { createReact } from "@/modules/posts/application/react";
import { createUnreact } from "@/modules/posts/application/unreact";
import { createPrismaPostsStore } from "@/modules/posts/infrastructure/prisma-posts-store";

/**
 * RBAC matrix coverage and IDOR cases for posts, achievements and moderation (Phase 10 §8 guardrails).
 *
 * The precedent this task named, `tests/security/messaging.security.test.ts`, does not exist in this
 * repo (checked: no file under that name anywhere in git history or the working tree). The closest real
 * analogues — real PostgreSQL, real seed, real `authorize`/`resolveActor`, no doubles — are
 * `tests/integration/auth/role-matrix.integration.test.ts` (actor resolution off seeded
 * PermissionGrant/RolePermission rows) and `tests/integration/mentorship/mentorship-lifecycle.integration.test.ts`
 * (real Prisma stores wired to real use cases against a per-test database). This file follows that shape.
 *
 * Every permission grant below comes from `database/prisma/seed-data/role-permissions.ts`, not from the
 * task brief's paraphrase of it (which the seed data disagrees with in two places: `achievement.submit` is
 * ALUMNI-only, not the general member baseline, and `achievement.review` sits on
 * ALUMNI_COORDINATOR/INSTITUTE_ADMIN/SUPER_ADMIN — MODERATOR does not hold it. `report.review` and
 * `post.moderate` do match: MODERATOR/INSTITUTE_ADMIN/SUPER_ADMIN.)
 */
describe("community security", () => {
  let db: TestDatabase;
  let grantor: string;
  let n = 0;

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    n = 0;
    grantor = (
      await db.prisma.user.create({
        data: {
          name: "Grantor",
          email: "grantor@example.test",
          accountState: "VERIFIED",
        },
      })
    ).id;
  });

  afterEach(async () => {
    await db.drop();
  });

  // The REAL authorizer (not a stub): what the RBAC matrix grants, seeded into RolePermission rows and
  // read back through resolveActor + createPrismaGrantSource, is what these tests exercise.
  const { authorize } = createAuthorization({
    observer: { record() {} },
    now: () => new Date(),
  });

  async function member(name: string): Promise<string> {
    n += 1;
    const user = await db.prisma.user.create({
      data: {
        name,
        email: `${name}-${n}@example.test`,
        accountState: "VERIFIED",
      },
    });
    return user.id;
  }

  async function grantRole(userId: string, roleName: RoleName): Promise<void> {
    const role = await db.prisma.role.findUniqueOrThrow({
      where: { name: roleName },
    });
    await db.prisma.userRole.create({
      data: { userId, roleId: role.id, grantedBy: grantor },
    });
  }

  /** A verified member holding exactly the grants of `roleName` (or no role at all). */
  async function actorWithRole(roleName?: RoleName): Promise<{
    userId: string;
    actor: Actor;
  }> {
    const userId = await member(roleName ?? "plain");
    if (roleName) await grantRole(userId, roleName);
    const actor = await resolveActor(
      {
        grantSource: createPrismaGrantSource(db.prisma),
        now: () => new Date(),
      },
      { userId, accountState: "VERIFIED" },
      "req-community-security"
    );
    return { userId, actor };
  }

  async function block(x: string, y: string): Promise<void> {
    const [userAId, userBId] = [x, y].sort() as [string, string];
    await db.prisma.connection.create({
      data: {
        userAId,
        userBId,
        requestedById: x,
        state: "BLOCKED",
        blockedById: x,
        respondedAt: new Date(),
      },
    });
  }

  function buildPosts() {
    const store = createPrismaPostsStore({
      runner: createTransactionRunner(db.prisma),
      outbox: createOutboxWriter(),
    });
    return {
      store,
      createPost: createCreatePost({ store, authorize }),
      addComment: createAddComment({ store, authorize }),
      react: createReact({ store, authorize }),
      unreact: createUnreact({ store, authorize }),
      deletePost: createDeletePost({ store, authorize }),
      deleteComment: createDeleteComment({ store, authorize }),
      listComments: createListComments({ store, authorize }),
    };
  }

  function buildAchievements() {
    const store = createPrismaAchievementsStore({
      runner: createTransactionRunner(db.prisma),
      outbox: createOutboxWriter(),
    });
    return {
      submit: createSubmitAchievement({ store, authorize }),
      withdraw: createWithdrawAchievement({ store, authorize }),
      review: createReviewAchievement({ store, authorize }),
    };
  }

  function buildModeration() {
    const store = createPrismaModerationStore({
      runner: createTransactionRunner(db.prisma),
      outbox: createOutboxWriter(),
    });
    return {
      file: createFileContentReport({ store, authorize }),
      claim: createClaimReport({ store, authorize }),
      resolve: createResolveReport({ store, authorize }),
      dismiss: createDismissReport({ store, authorize }),
    };
  }

  const NONEXISTENT = "00000000-0000-4000-8000-000000000999";

  describe("post.create", () => {
    it("a verified member can create a post", async () => {
      const { createPost } = buildPosts();
      const { actor } = await actorWithRole("STUDENT");
      const { postId } = await createPost({
        actor,
        input: { content: "hello world" },
      });
      expect(
        await db.prisma.post.findUnique({ where: { id: postId } })
      ).not.toBeNull();
    });

    it("an unauthenticated actor cannot create a post", async () => {
      const { createPost } = buildPosts();
      await expect(
        createPost({ actor: null, input: { content: "hello world" } })
      ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
      expect(await db.prisma.post.count()).toBe(0);
    });
  });

  describe("post.interact (comment / react)", () => {
    it("a non-author, non-blocked member can comment and react", async () => {
      const { store, addComment, react } = buildPosts();
      const { userId: authorId } = await actorWithRole("STUDENT");
      const { actor: commenter } = await actorWithRole("STUDENT");
      const post = await store.transaction((tx) =>
        tx.insertPost({
          authorId,
          chapterId: null,
          content: "hi",
          imageUrls: [],
          linkUrl: null,
          postType: "TEXT",
        })
      );

      const comment = await addComment({
        actor: commenter,
        postId: post.id,
        input: { body: "nice post" },
      });
      expect(comment.postId).toBe(post.id);

      await react({
        actor: commenter,
        postId: post.id,
        input: { type: "LIKE" },
      });
      expect(
        await db.prisma.reaction.findUnique({
          where: {
            postId_userId: { postId: post.id, userId: commenter.userId },
          },
        })
      ).not.toBeNull();
    });

    it("a blocked pair gets NOT_FOUND both directions", async () => {
      const { store, addComment, react } = buildPosts();
      const { userId: aId, actor: a } = await actorWithRole("STUDENT");
      const { userId: bId, actor: b } = await actorWithRole("STUDENT");
      await block(aId, bId);

      const postByA = await store.transaction((tx) =>
        tx.insertPost({
          authorId: aId,
          chapterId: null,
          content: "post by a",
          imageUrls: [],
          linkUrl: null,
          postType: "TEXT",
        })
      );
      const postByB = await store.transaction((tx) =>
        tx.insertPost({
          authorId: bId,
          chapterId: null,
          content: "post by b",
          imageUrls: [],
          linkUrl: null,
          postType: "TEXT",
        })
      );

      // b (blocked) interacting with a's post
      await expect(
        addComment({ actor: b, postId: postByA.id, input: { body: "hi" } })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      // a interacting with b's post — the block is symmetric, refused in the other direction too
      await expect(
        react({ actor: a, postId: postByB.id, input: { type: "LIKE" } })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("own-content delete (IDOR)", () => {
    it("deletePost by a non-author is refused NOT_OWNER", async () => {
      const { store, deletePost } = buildPosts();
      const { userId: authorId } = await actorWithRole("STUDENT");
      const { actor: stranger } = await actorWithRole("STUDENT");
      const post = await store.transaction((tx) =>
        tx.insertPost({
          authorId,
          chapterId: null,
          content: "mine",
          imageUrls: [],
          linkUrl: null,
          postType: "TEXT",
        })
      );

      await expect(
        deletePost({ actor: stranger, postId: post.id })
      ).rejects.toMatchObject({ code: "NOT_OWNER" });
      expect(
        (await db.prisma.post.findUniqueOrThrow({ where: { id: post.id } }))
          .deleted
      ).toBe(false);
    });

    it("deleteComment by a non-author is refused NOT_OWNER", async () => {
      const { store, deleteComment } = buildPosts();
      const { userId: authorId } = await actorWithRole("STUDENT");
      const { userId: commenterId } = await actorWithRole("STUDENT");
      const { actor: stranger } = await actorWithRole("STUDENT");
      const post = await store.transaction((tx) =>
        tx.insertPost({
          authorId,
          chapterId: null,
          content: "mine",
          imageUrls: [],
          linkUrl: null,
          postType: "TEXT",
        })
      );
      const comment = await store.transaction((tx) =>
        tx.insertComment({ postId: post.id, authorId: commenterId, body: "hi" })
      );

      await expect(
        deleteComment({ actor: stranger, commentId: comment.id })
      ).rejects.toMatchObject({ code: "NOT_OWNER" });
      expect(
        (
          await db.prisma.comment.findUniqueOrThrow({
            where: { id: comment.id },
          })
        ).deleted
      ).toBe(false);
    });
  });

  describe("achievement.submit", () => {
    it("ALUMNI (the role holding achievement.submit) may submit", async () => {
      const { submit } = buildAchievements();
      const { actor } = await actorWithRole("ALUMNI");
      const { achievementId } = await submit({
        actor,
        input: { title: "Award", description: "d", category: "AWARD" },
      });
      expect(
        await db.prisma.achievement.findUnique({ where: { id: achievementId } })
      ).not.toBeNull();
    });

    it.each(["STUDENT", "FACULTY", "STAFF"] as const)(
      "%s does not hold achievement.submit and is refused",
      async (roleName) => {
        const { submit } = buildAchievements();
        const { actor } = await actorWithRole(roleName);
        await expect(
          submit({
            actor,
            input: { title: "Award", description: "d", category: "AWARD" },
          })
        ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
      }
    );
  });

  describe("achievement.review", () => {
    const REVIEWER_ROLES = [
      "ALUMNI_COORDINATOR",
      "INSTITUTE_ADMIN",
      "SUPER_ADMIN",
    ] as const;
    const NON_REVIEWER_ROLES = [
      "STUDENT",
      "ALUMNI",
      "FACULTY",
      "STAFF",
      "MODERATOR",
    ] as const;

    it.each(REVIEWER_ROLES)(
      "%s (holds achievement.review) may review someone else's submission",
      async (roleName) => {
        const { submit, review } = buildAchievements();
        const { actor: owner } = await actorWithRole("ALUMNI");
        const { achievementId } = await submit({
          actor: owner,
          input: { title: "Award", description: "d", category: "AWARD" },
        });
        const { actor: reviewer } = await actorWithRole(roleName);
        await review({ actor: reviewer, achievementId, outcome: "approve" });
        expect(
          (
            await db.prisma.achievement.findUniqueOrThrow({
              where: { id: achievementId },
            })
          ).status
        ).toBe("PUBLISHED");
      }
    );

    it.each(NON_REVIEWER_ROLES)(
      "%s does not hold achievement.review and is refused, even MODERATOR",
      async (roleName) => {
        const { submit, review } = buildAchievements();
        const { actor: owner } = await actorWithRole("ALUMNI");
        const { achievementId } = await submit({
          actor: owner,
          input: { title: "Award", description: "d", category: "AWARD" },
        });
        const { actor: caller } = await actorWithRole(roleName);
        await expect(
          review({ actor: caller, achievementId, outcome: "approve" })
        ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
      }
    );

    it("the achievement's own owner is refused SELF_REVIEW_FORBIDDEN, even holding a reviewer role", async () => {
      const { submit, review } = buildAchievements();
      const { userId, actor } = await actorWithRole("ALUMNI");
      await grantRole(userId, "ALUMNI_COORDINATOR");
      const selfReviewer = await resolveActor(
        {
          grantSource: createPrismaGrantSource(db.prisma),
          now: () => new Date(),
        },
        { userId, accountState: "VERIFIED" },
        "req-self-review"
      );
      const { achievementId } = await submit({
        actor,
        input: { title: "Award", description: "d", category: "AWARD" },
      });

      await expect(
        review({ actor: selfReviewer, achievementId, outcome: "approve" })
      ).rejects.toMatchObject({ code: "SELF_REVIEW_FORBIDDEN" });
    });
  });

  describe("report.review (claim / resolve / dismiss)", () => {
    const REVIEWER_ROLES = [
      "MODERATOR",
      "INSTITUTE_ADMIN",
      "SUPER_ADMIN",
    ] as const;
    const NON_REVIEWER_ROLES = [
      "STUDENT",
      "ALUMNI",
      "FACULTY",
      "STAFF",
      "ALUMNI_COORDINATOR",
      "TP_ADMIN",
    ] as const;

    async function reportedPost() {
      const { store } = buildPosts();
      const { userId: authorId } = await actorWithRole("STUDENT");
      const { userId: reporterId, actor: reporter } =
        await actorWithRole("STUDENT");
      const post = await store.transaction((tx) =>
        tx.insertPost({
          authorId,
          chapterId: null,
          content: "reported",
          imageUrls: [],
          linkUrl: null,
          postType: "TEXT",
        })
      );
      const { file } = buildModeration();
      const { reportId } = await file({
        actor: reporter,
        input: { targetType: "POST", targetId: post.id, reason: "spam" },
      });
      return { authorId, reporterId, reporter, postId: post.id, reportId };
    }

    it.each(REVIEWER_ROLES)(
      "%s (holds report.review, matching post.moderate's set) may claim, resolve and dismiss",
      async (roleName) => {
        const { reportId, postId } = await reportedPost();
        const { actor: reviewer } = await actorWithRole(roleName);
        const { claim } = buildModeration();
        await claim({ actor: reviewer, reportId });
        expect(
          (
            await db.prisma.report.findUniqueOrThrow({
              where: { id: reportId },
            })
          ).status
        ).toBe("UNDER_REVIEW");

        const { resolve } = buildModeration();
        await resolve({ actor: reviewer, reportId });
        expect(
          (
            await db.prisma.report.findUniqueOrThrow({
              where: { id: reportId },
            })
          ).status
        ).toBe("RESOLVED");
        expect(
          (await db.prisma.post.findUniqueOrThrow({ where: { id: postId } }))
            .deleted
        ).toBe(true);
      }
    );

    it.each(NON_REVIEWER_ROLES)(
      "%s does not hold report.review and is refused claim/resolve/dismiss",
      async (roleName) => {
        const { reportId } = await reportedPost();
        const { actor: caller } = await actorWithRole(roleName);
        const { claim, resolve, dismiss } = buildModeration();
        await expect(claim({ actor: caller, reportId })).rejects.toMatchObject({
          code: "PERMISSION_DENIED",
        });
        await expect(
          resolve({ actor: caller, reportId })
        ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
        await expect(
          dismiss({ actor: caller, reportId })
        ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
      }
    );

    it("resolve/dismiss by the reporter is refused SELF_REVIEW_FORBIDDEN, even holding the reviewer role", async () => {
      const { reporterId, reportId } = await reportedPost();
      await grantRole(reporterId, "MODERATOR");
      const reporterAsReviewer = await resolveActor(
        {
          grantSource: createPrismaGrantSource(db.prisma),
          now: () => new Date(),
        },
        { userId: reporterId, accountState: "VERIFIED" },
        "req-self-review-reporter"
      );
      const { resolve } = buildModeration();
      await expect(
        resolve({ actor: reporterAsReviewer, reportId })
      ).rejects.toMatchObject({ code: "SELF_REVIEW_FORBIDDEN" });
    });

    it("dismiss by the content author is refused SELF_REVIEW_FORBIDDEN, even holding the reviewer role", async () => {
      const { authorId, reportId } = await reportedPost();
      await grantRole(authorId, "MODERATOR");
      const authorAsReviewer = await resolveActor(
        {
          grantSource: createPrismaGrantSource(db.prisma),
          now: () => new Date(),
        },
        { userId: authorId, accountState: "VERIFIED" },
        "req-self-review-author"
      );
      const { dismiss } = buildModeration();
      await expect(
        dismiss({ actor: authorAsReviewer, reportId })
      ).rejects.toMatchObject({ code: "SELF_REVIEW_FORBIDDEN" });
    });
  });

  describe("IDOR: well-formed but nonexistent ids", () => {
    it("listComments on a nonexistent post returns NOT_FOUND, not a 500 or a different shape", async () => {
      const { listComments } = buildPosts();
      const { actor } = await actorWithRole("STUDENT");
      await expect(
        listComments({ actor, postId: NONEXISTENT })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("withdrawAchievement on a nonexistent achievement returns NOT_FOUND", async () => {
      const { withdraw } = buildAchievements();
      const { actor } = await actorWithRole("ALUMNI");
      await expect(
        withdraw({ actor, achievementId: NONEXISTENT })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("resolveReport on a nonexistent report returns NOT_FOUND", async () => {
      const { resolve } = buildModeration();
      const { actor } = await actorWithRole("MODERATOR");
      await expect(
        resolve({ actor, reportId: NONEXISTENT })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });
});
