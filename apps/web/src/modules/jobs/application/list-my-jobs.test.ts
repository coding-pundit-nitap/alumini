import { describe, expect, it } from "vitest";

import { AuthenticationError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { jobRow } from "../../../../tests/support/fake-job-store";
import { createListMyJobs } from "./list-my-jobs";

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

describe("listMyJobs", () => {
  it("asks the query for the caller's own id and caps limit at MAX_LIMIT", async () => {
    let seen: unknown;
    const listMyJobs = createListMyJobs({
      queries: {
        listMine: async (userId, filter) => {
          seen = { userId, filter };
          return [];
        },
      } as never,
      authorize,
    });
    await listMyJobs({ actor: actor("poster-1"), limit: 500 });
    expect(seen).toMatchObject({ userId: "poster-1", filter: { limit: 51 } }); // MAX_LIMIT(50) + 1
  });

  it("returns hasMore and a cursor when the query returns one extra row", async () => {
    const rows = [jobRow({ id: "a" }), jobRow({ id: "b" })];
    const listMyJobs = createListMyJobs({
      queries: { listMine: async () => rows } as never,
      authorize,
    });
    const page = await listMyJobs({ actor: actor("poster-1"), limit: 1 });
    expect(page.data).toHaveLength(1);
    expect(page.page.hasMore).toBe(true);
    expect(page.page.nextCursor).not.toBeNull();
  });
});
