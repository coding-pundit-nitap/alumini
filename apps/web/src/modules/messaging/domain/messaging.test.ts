import { describe, expect, it } from "vitest";

import { decodeSeqCursor, encodeSeqCursor } from "./cursor";
import {
  MAX_GROUP_SIZE,
  decideAddCapacity,
  decideDirectAccess,
  decideManage,
  directPairKey,
  groupInput,
  messageInput,
  readInput,
  reportInput,
  toListedMessage,
} from "./messaging";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;

describe("directPairKey", () => {
  it("is the same for both directions and lower-cased", () => {
    expect(directPairKey(A, B)).toBe(directPairKey(B.toUpperCase(), A));
    expect(directPairKey(A, B)).toBe(`${A}:${B}`);
  });
});

describe("input schemas", () => {
  const cid = "11111111-1111-4111-8111-111111111111";
  it("trims the body and bounds it to 1..4000", () => {
    expect(
      messageInput.parse({ body: "  hi  ", clientMessageId: cid }).body
    ).toBe("hi");
    expect(
      messageInput.safeParse({ body: "   ", clientMessageId: cid }).success
    ).toBe(false);
    expect(
      messageInput.safeParse({ body: "x".repeat(4001), clientMessageId: cid })
        .success
    ).toBe(false);
    expect(
      messageInput.safeParse({ body: "x".repeat(4000), clientMessageId: cid })
        .success
    ).toBe(true);
  });
  it("requires a uuid client id and refuses unknown keys", () => {
    expect(
      messageInput.safeParse({ body: "x", clientMessageId: "nope" }).success
    ).toBe(false);
    expect(
      messageInput.safeParse({ body: "x", clientMessageId: cid, extra: 1 })
        .success
    ).toBe(false);
  });
  it("needs 2..19 distinct other members for a group", () => {
    expect(groupInput.safeParse({ memberIds: [uuid(1)] }).success).toBe(false);
    expect(
      groupInput.safeParse({ memberIds: [uuid(1), uuid(2)] }).success
    ).toBe(true);
    expect(
      groupInput.safeParse({
        memberIds: Array.from({ length: MAX_GROUP_SIZE }, (_, i) =>
          uuid(i + 1)
        ),
      }).success
    ).toBe(false);
    expect(
      groupInput.safeParse({ memberIds: [uuid(1), uuid(1)] }).success
    ).toBe(false);
  });
  it("bounds a group title to 1..80 characters", () => {
    const members = { memberIds: [uuid(1), uuid(2)] };
    const title = (value: string) =>
      groupInput.safeParse({ ...members, title: value }).success;
    expect(title("x".repeat(81))).toBe(false);
    expect(title("x".repeat(80))).toBe(true);
    expect(title("")).toBe(false);
    expect(title("   ")).toBe(false);
  });
  it("bounds report reasons and read markers", () => {
    expect(reportInput.safeParse({ reason: "" }).success).toBe(false);
    expect(reportInput.safeParse({ reason: "spam" }).success).toBe(true);
    expect(reportInput.safeParse({ reason: "x".repeat(1001) }).success).toBe(
      false
    );
    expect(reportInput.safeParse({ reason: "x".repeat(1000) }).success).toBe(
      true
    );
    expect(readInput.safeParse({ upToSeq: "12" }).success).toBe(true);
    expect(readInput.safeParse({ upToSeq: "-1" }).success).toBe(false);
    expect(readInput.safeParse({ upToSeq: "1e3" }).success).toBe(false);
  });
});

describe("decideDirectAccess", () => {
  it("allows when there is no block", () => {
    expect(decideDirectAccess(null, A)).toEqual({ ok: true });
  });
  it("tells the blocker to unblock, and tells the blocked party nothing", () => {
    expect(decideDirectAccess({ blockedById: A }, A)).toEqual({
      ok: false,
      code: "MESSAGE_BLOCKED",
    });
    expect(decideDirectAccess({ blockedById: B }, A)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
  });
});

describe("group management", () => {
  it("only the creator manages participants", () => {
    expect(decideManage(A, A)).toEqual({ ok: true });
    expect(decideManage(A, B)).toEqual({ ok: false, code: "NOT_GROUP_ADMIN" });
  });
  it("refuses an add at the cap", () => {
    expect(decideAddCapacity(MAX_GROUP_SIZE - 1)).toEqual({ ok: true });
    expect(decideAddCapacity(MAX_GROUP_SIZE)).toEqual({
      ok: false,
      code: "GROUP_FULL",
    });
  });
});

describe("toListedMessage", () => {
  const row = {
    id: "m1",
    seq: "7",
    senderId: "u1",
    body: "hello",
    createdAt: new Date("2026-09-24T10:00:00Z"),
  };
  it("passes a visible message through", () => {
    expect(toListedMessage({ ...row, hiddenAt: null })).toEqual({
      id: "m1",
      seq: "7",
      senderId: "u1",
      createdAt: row.createdAt,
      hidden: false,
      body: "hello",
    });
  });
  it("drops the body of a hidden message but keeps its place", () => {
    expect(toListedMessage({ ...row, hiddenAt: new Date() })).toEqual({
      id: "m1",
      seq: "7",
      senderId: "u1",
      createdAt: row.createdAt,
      hidden: true,
      body: null,
    });
  });
});

describe("seq cursor", () => {
  it("round-trips a seq", () => {
    expect(decodeSeqCursor(encodeSeqCursor("9007199254740993"))).toBe(
      "9007199254740993"
    );
  });
  it("rejects garbage", () => {
    expect(() => decodeSeqCursor("%%%")).toThrowError(/cursor/i);
    expect(() => decodeSeqCursor(encodeSeqCursor("abc"))).toThrowError(
      /cursor/i
    );
  });
});
