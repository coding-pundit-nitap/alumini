import { describe, expect, it, vi } from "vitest";

import { parseDirectoryQuery, type SearchPort } from "@nitap/search";

import { AuthorizationError, RateLimitedError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { createSearchDirectory } from "./search-directory";

const actor = {
  userId: "u1",
  accountState: "VERIFIED",
  requestId: "r",
  grants: [],
} as Actor;
const parsed = parseDirectoryQuery({});
const query = parsed.ok ? parsed.query : (undefined as never);

function setup(
  over: { allowed?: boolean; privileged?: boolean; deny?: boolean } = {}
) {
  const searchPeople = vi.fn<SearchPort["searchPeople"]>().mockResolvedValue({
    hits: [
      {
        userId: "a",
        fullName: "A",
        headline: null,
        department: null,
        degree: null,
        graduationYear: null,
        location: null,
        currentCompany: null,
        currentDesignation: null,
        hasPhoto: true,
      },
      {
        userId: "b",
        fullName: "B",
        headline: null,
        department: null,
        degree: null,
        graduationYear: null,
        location: null,
        currentCompany: null,
        currentDesignation: null,
        hasPhoto: false,
      },
    ],
    nextCursor: "next",
  });
  const consume = vi
    .fn()
    .mockResolvedValue({ allowed: over.allowed ?? true, retryAfter: 12 });
  const run = createSearchDirectory({
    authorize: (a) => {
      if (over.deny) throw new AuthorizationError();
      return a as Actor;
    },
    search: { searchPeople },
    rateLimiter: { consume },
  });
  return { run, searchPeople, consume };
}

describe("searchDirectory", () => {
  it("maps hits to summaries with a photo path only where there is a photo", async () => {
    const { run } = setup();
    const page = await run({ actor, query });
    expect(page.data.map((p) => p.photoUrl)).toEqual([
      "/api/photos/a",
      undefined,
    ]);
    expect(page.data[0]).not.toHaveProperty("userId");
    expect(page.page).toEqual({ limit: 20, nextCursor: "next", hasMore: true });
  });

  it("searches as the caller, with no privileged reach for anyone", async () => {
    const { run, searchPeople } = setup({ privileged: true });
    await run({ actor, query });
    expect(searchPeople.mock.calls[0]![1]).toEqual({ userId: "u1" });
  });

  it("refuses an unauthorized caller before searching or counting", async () => {
    const { run, searchPeople, consume } = setup({ deny: true });
    await expect(run({ actor: null, query })).rejects.toBeInstanceOf(
      AuthorizationError
    );
    expect(consume).not.toHaveBeenCalled();
    expect(searchPeople).not.toHaveBeenCalled();
  });

  it("answers 429 with the retry time when the limit is spent, without searching", async () => {
    const { run, searchPeople } = setup({ allowed: false });
    const error = await run({ actor, query }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RateLimitedError);
    expect((error as RateLimitedError).retryAfterSeconds).toBe(12);
    expect(searchPeople).not.toHaveBeenCalled();
  });
});
