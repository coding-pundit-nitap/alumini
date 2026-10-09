import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Captured } from "../../tests/support/capture-factories";

const captured = vi.hoisted(() => new Map<string, Captured>());
const getOwnProfile = vi.hoisted(() => vi.fn());

vi.mock("@/modules/posts", async (importOriginal) => {
  const { captureFactories } =
    await import("../../tests/support/capture-factories");
  return captureFactories(await importOriginal(), captured);
});
vi.mock("./ticks", async () => ({
  addTicks: (await import("../../tests/support/capture-factories")).infra
    .addTicks,
}));
vi.mock("./users", () => ({ getOwnProfile }));
vi.mock("@/infrastructure/audit", () => ({ audit: {} }));
vi.mock("@/infrastructure/database/client", () => ({ transactionRunner: {} }));
vi.mock("@/infrastructure/outbox", () => ({ outbox: {} }));
vi.mock("@/modules/auth", () => ({ authorize: vi.fn() }));

import { infra } from "../../tests/support/capture-factories";
import * as posts from "./posts";

const built = (name: string) => captured.get(name)!.built;
const author = { id: "a1", fullName: "A", headline: null, hasPhoto: false };
const actor = { userId: "u1" } as never;

/** Runs the id and target pickers the wrapper handed to addTicks, over its rows. */
function ticked(call: number) {
  const [rows, idOf, targetOf] = infra.addTicks.mock.calls[call] as unknown as [
    unknown[],
    (row: unknown) => string,
    (row: unknown) => unknown,
  ];
  return rows.map((row) => [idOf(row), targetOf(row)]);
}

beforeEach(() => {
  infra.addTicks.mockClear();
});

describe("posts composition", () => {
  it("decorates the feed's, a post's and a comment page's authors with ticks", async () => {
    const post = { id: "p1", author };
    built("createListFeed").mockResolvedValue({
      posts: [post],
      nextCursor: null,
    });
    built("createGetPost").mockResolvedValue(post);
    built("createListComments").mockResolvedValue({
      comments: [{ id: "c1", author }],
      nextCursor: null,
    });

    expect(await posts.listFeed({ actor })).toEqual({
      posts: [post],
      nextCursor: null,
    });
    expect(await posts.getPost({ actor, postId: "p1" })).toBe(post);
    await posts.listComments({ actor, postId: "p1" });
    for (const call of [0, 1, 2])
      expect(ticked(call)).toEqual([["a1", author]]);
  });

  it("decorates a pinned announcement, and skips when there is none", async () => {
    built("createGetPinnedAnnouncement")
      .mockResolvedValueOnce({ id: "p1", author })
      .mockResolvedValueOnce(null);
    await posts.getPinnedAnnouncement({ actor });
    expect(ticked(0)).toEqual([["a1", author]]);
    expect(await posts.getPinnedAnnouncement({ actor })).toBeNull();
    expect(infra.addTicks).toHaveBeenCalledTimes(1);
  });

  it("gives the viewer as an author, or undefined when the profile can't be read", async () => {
    getOwnProfile.mockResolvedValueOnce({
      userId: "u1",
      fullName: "Asha",
      headline: "SDE",
      photoUploadId: "x",
    });
    expect(await posts.getViewerAuthor(actor)).toEqual({
      id: "u1",
      fullName: "Asha",
      headline: "SDE",
      hasPhoto: true,
    });
    getOwnProfile.mockRejectedValueOnce(new Error("down"));
    expect(await posts.getViewerAuthor(actor)).toBeUndefined();
  });
});
