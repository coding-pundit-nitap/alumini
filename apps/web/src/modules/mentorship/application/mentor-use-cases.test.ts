import { describe, expect, it, vi } from "vitest";

import { AuthenticationError, AuthorizationError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { createGetMentorProfile } from "./get-mentor-profile";
import { createListMentors } from "./list-mentors";
import type { MentorCard, MentorQueries } from "./mentor-ports";
import { createSaveMentorProfile } from "./save-mentor-profile";

const actor: Actor = {
  userId: "u1",
  accountState: "VERIFIED",
  requestId: "r",
  grants: [],
};
const authorize = vi.fn((a: Actor | null) => {
  if (!a) throw new AuthenticationError();
  return a;
});
const card = (n: number): MentorCard => ({
  userId: `m${n}`,
  fullName: `Mentor ${n}`,
  headline: null,
  department: null,
  currentCompany: null,
  hasPhoto: false,
  expertise: "x",
  topics: [],
  availability: "",
  preferredContactMethod: "IN_APP",
  sortKey: `mentor ${n}`,
});

describe("saveMentorProfile", () => {
  it("authorizes mentor.opt_in, validates, and upserts for the caller only", async () => {
    const upsert = vi.fn(
      async (userId: string, input: object) => ({ userId, ...input }) as never
    );
    const save = createSaveMentorProfile({ store: { upsert }, authorize });
    await save({ actor, input: { expertise: " DB ", topics: ["A"] } });
    expect(authorize).toHaveBeenCalledWith(actor, "mentor.opt_in");
    expect(upsert).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ expertise: "DB", topics: ["a"] })
    );
  });
  it("refuses invalid input with field details and never writes", async () => {
    const upsert = vi.fn();
    const save = createSaveMentorProfile({ store: { upsert }, authorize });
    await expect(
      save({ actor, input: { expertise: "" } })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(upsert).not.toHaveBeenCalled();
  });
  it("propagates an authorization failure before touching input or store", async () => {
    const deny = vi.fn(() => {
      throw new AuthorizationError();
    });
    const upsert = vi.fn();
    await expect(
      createSaveMentorProfile({ store: { upsert }, authorize: deny })({
        actor,
        input: {},
      })
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("listMentors", () => {
  const queries = (rows: MentorCard[]): MentorQueries => ({
    list: vi.fn(async (_v, f) => rows.slice(0, f.limit)),
    findProfile: vi.fn(),
  });
  it("asks for limit+1, trims, and returns a cursor when there is more", async () => {
    const q = queries([card(1), card(2), card(3)]);
    const page = await createListMentors({ queries: q, authorize })({
      actor,
      limit: 2,
    });
    expect(q.list).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ limit: 3 })
    );
    expect(page.data.map((m) => m.userId)).toEqual(["m1", "m2"]);
    expect(page.page.hasMore).toBe(true);
    expect(page.page.nextCursor).toEqual(expect.any(String));
    expect(page.data[0]).not.toHaveProperty("sortKey");
  });
  it("clamps limit to 1..50 and rejects a malformed cursor", async () => {
    const q = queries([]);
    await createListMentors({ queries: q, authorize })({ actor, limit: 9999 });
    expect(q.list).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ limit: 51 })
    );
    await expect(
      createListMentors({ queries: q, authorize })({ actor, cursor: "@@" })
    ).rejects.toMatchObject({ code: "INVALID_CURSOR" });
  });
  it("lower-cases the topic filter", async () => {
    const q = queries([]);
    await createListMentors({ queries: q, authorize })({
      actor,
      topic: "Rust",
    });
    expect(q.list).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ topic: "rust" })
    );
  });
});

describe("getMentorProfile", () => {
  it("returns the caller's own row", async () => {
    const findProfile = vi.fn(async () => null);
    await createGetMentorProfile({
      queries: { list: vi.fn(), findProfile },
      authorize,
    })({ actor });
    expect(findProfile).toHaveBeenCalledWith("u1");
  });
});
