import { describe, expect, it, vi } from "vitest";

import { PERMISSIONS } from "@nitap/database/permissions";

import { AuthenticationError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { encodeCursor } from "../domain/cursor";
import type { Authorize } from "./authz";
import { createListMentorships } from "./list-mentorships";
import type { ListedMentorship } from "./mentorship-store";

const actor = { userId: "u1" } as Actor;
const item = (n: number): ListedMentorship => ({
  id: `ms-${n}`,
  state: "REQUESTED",
  counterparty: { id: "c", fullName: "C", hasPhoto: false },
  topic: null,
  message: "hi",
  responseNote: null,
  requestedAt: new Date(Date.UTC(2026, 8, 1, 0, 0, 10 - n)),
  respondedAt: null,
  startedAt: null,
  endedAt: null,
});

function setup(rows: ListedMentorship[] = []) {
  const list = vi.fn(async () => rows);
  const asked: string[] = [];
  const authorize = ((a: Actor | null, permission: string) => {
    asked.push(permission);
    if (!a) throw new AuthenticationError();
    return a;
  }) as Authorize;
  return {
    list,
    asked,
    run: createListMentorships({ queries: { list }, authorize }),
  };
}

describe("listMentorships", () => {
  it("requires authentication", async () => {
    await expect(
      setup().run({ actor: null, role: "mentee" })
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("asks for mentorship.request as a mentee and mentorship.respond as a mentor", async () => {
    const s = setup();
    await s.run({ actor, role: "mentee" });
    await s.run({ actor, role: "mentor" });
    expect(s.asked).toEqual([
      PERMISSIONS.MENTORSHIP_REQUEST,
      PERMISSIONS.MENTORSHIP_RESPOND,
    ]);
  });

  it("clamps the limit, fetches one extra row and passes states through", async () => {
    const s = setup();
    await s.run({
      actor,
      role: "mentor",
      states: ["ACCEPTED", "ACTIVE"],
      limit: 500,
    });
    expect(s.list).toHaveBeenCalledWith("u1", {
      role: "mentor",
      states: ["ACCEPTED", "ACTIVE"],
      limit: 51,
      after: undefined,
    });
  });

  it("pages: nextCursor is the last kept row; none on the last page", async () => {
    const rows = [item(1), item(2), item(3)];
    const first = await setup(rows).run({ actor, role: "mentee", limit: 2 });
    expect(first.data.map((r) => r.id)).toEqual(["ms-1", "ms-2"]);
    expect(first.page).toEqual({
      limit: 2,
      hasMore: true,
      nextCursor: encodeCursor({
        key: rows[1]!.requestedAt.toISOString(),
        id: "ms-2",
      }),
    });
    const last = await setup(rows.slice(0, 2)).run({
      actor,
      role: "mentee",
      limit: 2,
    });
    expect(last.page).toMatchObject({ hasMore: false, nextCursor: null });
  });
});
