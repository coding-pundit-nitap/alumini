import { describe, expect, it, vi } from "vitest";

/** Mentorship use cases against the REAL authorizer: 401, 403, account states and IDOR (phase rule "Security"). */
import {
  AuthenticationError,
  AuthorizationError,
  ValidationError,
} from "@/lib/errors";
import { createAuthorization } from "@/modules/auth/application/authorize";
import type { Actor } from "@/modules/auth";

import {
  ROLE_PERMISSIONS,
  type RoleName,
} from "@nitap/database/role-permissions";

import { createSaveMentorProfile } from "@/modules/mentorship/application/save-mentor-profile";
import { createListMentors } from "@/modules/mentorship/application/list-mentors";
import type {
  MentorProfileRecord,
  MentorProfileStore,
  MentorQueries,
} from "@/modules/mentorship/application/mentor-ports";

// The REAL authorizer (not a stub): what the RBAC matrix grants is what these tests exercise.
const { authorize } = createAuthorization({
  observer: { record() {} },
  now: () => new Date("2026-09-21T10:00:00Z"),
});

const grantsFor = (role: RoleName) =>
  ROLE_PERMISSIONS[role].map((permission) => ({
    permission,
    scope: "GLOBAL" as const,
    expiresAt: null,
  }));

const actor = (userId: string, over: Partial<Actor> = {}): Actor => ({
  userId,
  accountState: "VERIFIED",
  requestId: "r",
  grants: [],
  ...over,
});

const OTHER_USER_ID = "00000000-0000-4000-8000-00000000000b";

function buildSave() {
  const upsert = vi.fn(async (userId: string, input: object) => ({
    userId,
    ...input,
  })) as unknown as MentorProfileStore["upsert"];
  const store: MentorProfileStore = { upsert };
  return { store, save: createSaveMentorProfile({ store, authorize }) };
}

function buildList() {
  const queries: MentorQueries = {
    list: vi.fn(async () => []),
    findProfile: vi.fn(async () => null),
  };
  return { queries, list: createListMentors({ queries, authorize }) };
}

describe("saveMentorProfile: real authorizer", () => {
  it("no session is a 401 and never writes", async () => {
    const { save, store } = buildSave();
    await expect(
      save({ actor: null, input: { expertise: "DB" } })
    ).rejects.toBeInstanceOf(AuthenticationError);
    expect(store.upsert).not.toHaveBeenCalled();
  });

  it("a STUDENT (no mentor.opt_in) is a 403 and never writes", async () => {
    const { save, store } = buildSave();
    await expect(
      save({
        actor: actor("u1", { grants: grantsFor("STUDENT") }),
        input: { expertise: "DB" },
      })
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(store.upsert).not.toHaveBeenCalled();
  });

  it.each(["PENDING", "REJECTED", "SUSPENDED", "DEACTIVATED"] as const)(
    "an unverified account (%s) is a 403 even with ALUMNI grants",
    async (accountState) => {
      const { save, store } = buildSave();
      await expect(
        save({
          actor: actor("u1", { accountState, grants: grantsFor("ALUMNI") }),
          input: { expertise: "DB" },
        })
      ).rejects.toBeInstanceOf(AuthorizationError);
      expect(store.upsert).not.toHaveBeenCalled();
    }
  );

  it("ALUMNI is allowed and the store is called with the actor's own id", async () => {
    const { save, store } = buildSave();
    const result = (await save({
      actor: actor("u1", { grants: grantsFor("ALUMNI") }),
      input: { expertise: "DB" },
    })) as MentorProfileRecord;
    expect(result.userId).toBe("u1");
    expect(store.upsert).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ expertise: "DB" })
    );
  });

  it("a userId in the input is rejected outright by the strict schema (IDOR is not reachable): the store is never called with a foreign id", async () => {
    const { save, store } = buildSave();
    await expect(
      save({
        actor: actor("u1", { grants: grantsFor("ALUMNI") }),
        input: { expertise: "DB", userId: OTHER_USER_ID },
      })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(store.upsert).not.toHaveBeenCalled();
  });
});

describe("listMentors: real authorizer", () => {
  it("no session is a 401", async () => {
    const { list } = buildList();
    await expect(list({ actor: null })).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it.each([
    "STUDENT",
    "ALUMNI",
    "FACULTY",
    "STAFF",
    "MODERATOR",
    "ALUMNI_COORDINATOR",
    "TP_ADMIN",
    "INSTITUTE_ADMIN",
    "SUPER_ADMIN",
  ] as const)("%s (every member role) may search mentors", async (role) => {
    const { list } = buildList();
    await expect(
      list({ actor: actor("u1", { grants: grantsFor(role) }) })
    ).resolves.toMatchObject({ data: [] });
  });
});
