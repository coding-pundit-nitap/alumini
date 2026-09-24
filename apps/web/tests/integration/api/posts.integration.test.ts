// apps/web/tests/integration/api/posts.integration.test.ts
//
// Route-level, real PostgreSQL, through the composed wiring (composition/posts.ts -> the real Prisma
// posts store -> a per-file isolated database). The one thing stubbed is session identification
// (@/modules/auth/infrastructure/actor's getActor): that submodule alone talks to Better Auth and
// next/headers, both of which need a live Next.js request context this vitest project doesn't have.
// Everything downstream of "who is the caller" — authorize(), the use cases, the store, the DB — is real.
//
// No precedent for this shape exists under tests/integration/api/ (the directory itself didn't exist
// before this file) or as a real-DB route test anywhere else in the repo: route tests that exist
// (src/app/api/v1/**/routes.test.ts) mock the whole composed module, and DB-backed integration tests
// (tests/integration/posts/use-cases.integration.test.ts, tests/security/community.security.integration.test.ts)
// call use cases directly, never through a Route Handler. This test combines both: real Route Handler,
// real DB, real authorize, actor resolved for real off seeded RolePermission rows (same construction as
// the community security suite), with only the session boundary swapped for a test double.
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { runSeed } from "@nitap/database/seed";
import type { RoleName } from "@nitap/database/role-permissions";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

const mocks = vi.hoisted(() => ({
  dbRef: { current: null as TestDatabase | null },
  getActor: vi.fn(),
}));

// The composition singletons (composition/posts.ts) capture `prisma`/`transactionRunner` at module
// load time; this proxy resolves every property against the CURRENT test database at call time, so one
// mock covers the whole file's tests without re-importing the composition module per test.
vi.mock("@/infrastructure/database/client", () => {
  const client = () => {
    if (!mocks.dbRef.current) throw new Error("test database not ready");
    return mocks.dbRef.current.prisma;
  };
  return {
    prisma: new Proxy(
      {},
      {
        get(_target, prop) {
          const value = (client() as unknown as Record<PropertyKey, unknown>)[
            prop
          ];
          return typeof value === "function" ? value.bind(client()) : value;
        },
      }
    ),
    transactionRunner: {
      run: (fn: (tx: unknown) => Promise<unknown>) => client().$transaction(fn),
    },
  };
});

// Only the session lookup is stubbed (see file header); authorize() and everything else stays real.
vi.mock("@/modules/auth/infrastructure/actor", () => ({
  getActor: mocks.getActor,
}));
// The `@/modules/auth` barrel re-exports `auth` (Better Auth), which instantiates itself at import
// time and would otherwise reach for the real database through the client mock above before
// `dbRef.current` is set in `beforeAll`. Nothing on this test's path calls `auth.api.*` (getActor is
// stubbed above), so a stub object is enough.
vi.mock("@/modules/auth/infrastructure/auth", () => ({ auth: {} }));

import {
  createPost,
  deleteComment,
  deletePost,
  addComment,
} from "@/composition/posts";
import type { Actor } from "@/modules/auth";
import { resolveActor } from "@/modules/auth/application/resolve-actor";
import { createPrismaGrantSource } from "@/modules/auth/infrastructure/prisma-grant-source";

import { GET as getFeed } from "@/app/api/v1/posts/route";
import { GET as getComments } from "@/app/api/v1/posts/[id]/comments/route";
import { GET as getUploadImage } from "@/app/api/uploads/[id]/route";

const ORIGIN = "https://alumni.example.test";
const req = (path: string) => new Request(`${ORIGIN}${path}`);
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const NONEXISTENT = "00000000-0000-4000-8000-000000000999";

describe("GET /api/v1/posts and /api/v1/posts/:id/comments", () => {
  let db: TestDatabase;
  let grantorId: string;
  let n = 0;

  beforeAll(async () => {
    db = await createTestDatabase();
    mocks.dbRef.current = db;
    await runSeed(db.prisma);
    grantorId = (
      await db.prisma.user.create({
        data: {
          name: "Grantor",
          email: "grantor@example.test",
          accountState: "VERIFIED",
        },
      })
    ).id;
  });

  afterAll(async () => {
    await db.drop();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    // Posts/comments/reactions are cleared between tests (the feed and a post's comments have no
    // per-test scoping); roles, permissions and the grantor survive for the whole file.
    await db.prisma.reaction.deleteMany();
    await db.prisma.comment.deleteMany();
    await db.prisma.post.deleteMany();
  });

  /** A real VERIFIED member holding STUDENT's baseline grants (POST_CREATE/POST_INTERACT), off seeded rows. */
  async function member(role: RoleName = "STUDENT"): Promise<Actor> {
    n += 1;
    const user = await db.prisma.user.create({
      data: {
        name: `Member${n}`,
        email: `member${n}@example.test`,
        accountState: "VERIFIED",
      },
    });
    const roleRow = await db.prisma.role.findUniqueOrThrow({
      where: { name: role },
    });
    await db.prisma.userRole.create({
      data: { userId: user.id, roleId: roleRow.id, grantedBy: grantorId },
    });
    return resolveActor(
      {
        grantSource: createPrismaGrantSource(db.prisma),
        now: () => new Date(),
      },
      { userId: user.id, accountState: "VERIFIED" },
      "req-posts-route-test"
    );
  }

  describe("GET /api/v1/posts", () => {
    it("401s a signed-out caller", async () => {
      mocks.getActor.mockResolvedValue(null);
      const res = await getFeed(req("/api/v1/posts"));
      expect(res.status).toBe(401);
    });

    it("returns a page of posts newest-first for a verified member", async () => {
      const actor = await member();
      mocks.getActor.mockResolvedValue(actor);
      const ids: string[] = [];
      for (let i = 0; i < 3; i += 1) {
        ids.push(
          (await createPost({ actor, input: { content: `p${i}` } })).postId
        );
      }
      const res = await getFeed(req("/api/v1/posts"));
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        posts: { id: string }[];
        nextCursor: string | null;
      };
      expect(body.posts.map((p) => p.id)).toEqual([...ids].reverse());
      expect(body.nextCursor).toBeNull();
    });

    it("round-trips the cursor across two pages with no overlap", async () => {
      const actor = await member();
      mocks.getActor.mockResolvedValue(actor);
      const ids: string[] = [];
      for (let i = 0; i < 3; i += 1) {
        ids.push(
          (await createPost({ actor, input: { content: `p${i}` } })).postId
        );
      }

      const first = await getFeed(req("/api/v1/posts?limit=2"));
      const firstBody = (await first.json()) as {
        posts: { id: string }[];
        nextCursor: string | null;
      };
      expect(firstBody.posts).toHaveLength(2);
      expect(firstBody.nextCursor).not.toBeNull();

      const second = await getFeed(
        req(
          `/api/v1/posts?limit=2&cursor=${encodeURIComponent(firstBody.nextCursor!)}`
        )
      );
      const secondBody = (await second.json()) as {
        posts: { id: string }[];
        nextCursor: string | null;
      };
      expect(secondBody.posts).toHaveLength(1);
      expect(secondBody.nextCursor).toBeNull();

      const firstIds = firstBody.posts.map((p) => p.id);
      const secondIds = secondBody.posts.map((p) => p.id);
      expect(firstIds.some((id) => secondIds.includes(id))).toBe(false);
      expect([...firstIds, ...secondIds]).toEqual([...ids].reverse());
    });

    it("excludes a soft-deleted post", async () => {
      const actor = await member();
      mocks.getActor.mockResolvedValue(actor);
      const { postId } = await createPost({
        actor,
        input: { content: "gone" },
      });
      await deletePost({ actor, postId });

      const res = await getFeed(req("/api/v1/posts"));
      const body = (await res.json()) as { posts: { id: string }[] };
      expect(body.posts.find((p) => p.id === postId)).toBeUndefined();
    });

    it("400s an invalid cursor", async () => {
      mocks.getActor.mockResolvedValue(await member());
      const res = await getFeed(req("/api/v1/posts?cursor=not-base64url-json"));
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/v1/posts/:id/comments", () => {
    it("401s a signed-out caller", async () => {
      const author = await member();
      const { postId } = await createPost({
        actor: author,
        input: { content: "x" },
      });
      mocks.getActor.mockResolvedValue(null);
      const res = await getComments(
        req(`/api/v1/posts/${postId}/comments`),
        ctx(postId)
      );
      expect(res.status).toBe(401);
    });

    it("returns a page of comments newest-first, cursor round-trips, excludes a soft-deleted comment", async () => {
      const author = await member();
      mocks.getActor.mockResolvedValue(author);
      const { postId } = await createPost({
        actor: author,
        input: { content: "post" },
      });

      const commentIds: string[] = [];
      for (let i = 0; i < 3; i += 1) {
        commentIds.push(
          (
            await addComment({
              actor: author,
              postId,
              input: { body: `c${i}` },
            })
          ).id
        );
      }
      await deleteComment({ actor: author, commentId: commentIds[1]! });

      const first = await getComments(
        req(`/api/v1/posts/${postId}/comments?limit=1`),
        ctx(postId)
      );
      const firstBody = (await first.json()) as {
        comments: { id: string }[];
        nextCursor: string | null;
      };
      expect(firstBody.comments).toHaveLength(1);
      expect(firstBody.comments[0]?.id).toBe(commentIds[2]);
      expect(firstBody.nextCursor).not.toBeNull();

      const second = await getComments(
        req(
          `/api/v1/posts/${postId}/comments?limit=1&cursor=${encodeURIComponent(
            firstBody.nextCursor!
          )}`
        ),
        ctx(postId)
      );
      const secondBody = (await second.json()) as {
        comments: { id: string }[];
        nextCursor: string | null;
      };
      expect(secondBody.comments.map((c) => c.id)).toEqual([commentIds[0]]);
      expect(secondBody.nextCursor).toBeNull();
    });

    it("404s for a nonexistent post and for a soft-deleted one", async () => {
      const actor = await member();
      mocks.getActor.mockResolvedValue(actor);

      expect(
        (
          await getComments(
            req(`/api/v1/posts/${NONEXISTENT}/comments`),
            ctx(NONEXISTENT)
          )
        ).status
      ).toBe(404);

      const { postId } = await createPost({
        actor,
        input: { content: "gone" },
      });
      await deletePost({ actor, postId });
      expect(
        (
          await getComments(
            req(`/api/v1/posts/${postId}/comments`),
            ctx(postId)
          )
        ).status
      ).toBe(404);
    });
  });

  describe("GET /api/uploads/:id", () => {
    /** A READY upload row (ck_upload_object_key_prefix requires avatars/ for READY). */
    function readyUpload(ownerId: string) {
      return db.prisma.upload.create({
        data: {
          ownerId,
          purpose: "PROFILE_PHOTO",
          objectKey: `avatars/${Math.random()}`,
          mime: "image/png",
          size: 1,
          status: "READY",
        },
      });
    }

    it("302s to a fresh presigned URL for a READY image referenced by a live post", async () => {
      const actor = await member();
      mocks.getActor.mockResolvedValue(actor);
      const upload = await readyUpload(actor.userId);
      await createPost({
        actor,
        input: { content: "x", imageUrls: [upload.id] },
      });

      const res = await getUploadImage(
        req(`/api/uploads/${upload.id}`),
        ctx(upload.id)
      );
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBeTruthy();
      expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    });

    it("404s a READY upload no live post references", async () => {
      const actor = await member();
      mocks.getActor.mockResolvedValue(actor);
      const upload = await readyUpload(actor.userId);

      const res = await getUploadImage(
        req(`/api/uploads/${upload.id}`),
        ctx(upload.id)
      );
      expect(res.status).toBe(404);
    });

    it("404s a non-uuid id", async () => {
      mocks.getActor.mockResolvedValue(await member());
      const res = await getUploadImage(
        req("/api/uploads/not-a-uuid"),
        ctx("not-a-uuid")
      );
      expect(res.status).toBe(404);
    });

    it("rejects with 401 when signed out, rather than swallowing it as 404", async () => {
      mocks.getActor.mockResolvedValue(null);
      await expect(
        getUploadImage(req(`/api/uploads/${NONEXISTENT}`), ctx(NONEXISTENT))
      ).rejects.toMatchObject({ status: 401 });
    });
  });
});
