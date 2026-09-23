import { describe, expect, it } from "vitest";

import type { Actor } from "@/modules/auth";

import { createListPublishedJobs } from "./list-published-jobs";

const actor: Actor = {
  userId: "u1",
  accountState: "VERIFIED",
  requestId: "r",
  grants: [],
};
const authorize = (a: Actor | null) => {
  if (!a) throw new Error("unauthenticated");
  return a;
};

describe("listPublishedJobs", () => {
  it("normalises the location filter (trim) and passes employmentType/workMode through", async () => {
    let seen: unknown;
    const listPublishedJobs = createListPublishedJobs({
      queries: {
        listPublished: async (filter: unknown) => {
          seen = filter;
          return [];
        },
      } as never,
      authorize,
    });
    await listPublishedJobs({
      actor,
      employmentType: "INTERNSHIP",
      workMode: "REMOTE",
      location: "  Bengaluru  ",
      limit: 10,
    });
    expect(seen).toMatchObject({
      employmentType: "INTERNSHIP",
      workMode: "REMOTE",
      location: "Bengaluru",
      limit: 11,
    });
  });

  it("does not require any particular permission beyond job.read (public listing)", async () => {
    const listPublishedJobs = createListPublishedJobs({
      queries: { listPublished: async () => [] } as never,
      authorize,
    });
    await expect(listPublishedJobs({ actor })).resolves.toMatchObject({
      data: [],
    });
  });
});
