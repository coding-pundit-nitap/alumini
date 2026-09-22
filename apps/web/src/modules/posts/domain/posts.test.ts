import { describe, expect, it } from "vitest";

import { decodeFeedCursor, encodeFeedCursor } from "./cursor";
import {
  REACTION_TYPES,
  commentInput,
  decideInteract,
  decideOwn,
  postInput,
  reactInput,
} from "./posts";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("input schemas", () => {
  it("bounds post content to 1..5000, at most 4 images, https-only link", () => {
    expect(postInput.safeParse({ content: "" }).success).toBe(false);
    expect(postInput.safeParse({ content: "x".repeat(5001) }).success).toBe(
      false
    );
    expect(postInput.safeParse({ content: "hi" }).success).toBe(true);
    expect(
      postInput.safeParse({
        content: "hi",
        imageUrls: Array(5).fill("00000000-0000-4000-8000-000000000001"),
      }).success
    ).toBe(false);
    expect(
      postInput.safeParse({ content: "hi", linkUrl: "http://x.test" }).success
    ).toBe(false);
    expect(
      postInput.safeParse({ content: "hi", linkUrl: "https://x.test" }).success
    ).toBe(true);
  });
  it("bounds comment body to 1..2000", () => {
    expect(commentInput.safeParse({ body: "" }).success).toBe(false);
    expect(commentInput.safeParse({ body: "x".repeat(2001) }).success).toBe(
      false
    );
    expect(commentInput.safeParse({ body: "hi" }).success).toBe(true);
  });
  it("only accepts the fixed reaction allow-list", () => {
    for (const type of REACTION_TYPES) {
      expect(reactInput.safeParse({ type }).success).toBe(true);
    }
    expect(reactInput.safeParse({ type: "LOVE" }).success).toBe(false);
  });
});

describe("decideInteract (comment/react eligibility, C-10)", () => {
  const post = { id: "p1", authorId: A, deleted: false };
  it("allows any verified member on a visible post with no block", () => {
    expect(decideInteract(post, null)).toEqual({ ok: true });
  });
  it("refuses a deleted post as NOT_FOUND", () => {
    expect(decideInteract({ ...post, deleted: true }, null)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
  });
  it("refuses NOT_FOUND on either side of a block, revealing nothing (no distinct blocked error)", () => {
    expect(decideInteract(post, true)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(decideInteract(post, true)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
  });
});

describe("decideOwn", () => {
  it("only the author may delete their own post/comment", () => {
    expect(decideOwn(A, A)).toEqual({ ok: true });
    expect(decideOwn(A, B)).toEqual({ ok: false, code: "NOT_OWNER" });
  });
});

describe("feed cursor", () => {
  it("round-trips (createdAt, id)", () => {
    const cursor = {
      createdAt: new Date("2026-09-22T00:00:00.000Z"),
      id: "p1",
    };
    const decoded = decodeFeedCursor(encodeFeedCursor(cursor));
    expect(decoded.createdAt.toISOString()).toBe(
      cursor.createdAt.toISOString()
    );
    expect(decoded.id).toBe("p1");
  });
  it("rejects garbage", () => {
    expect(() => decodeFeedCursor("%%%")).toThrowError(/cursor/i);
  });
});
