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

import { createFakeMentorshipStore } from "../support/fake-mentorship-store";
import { createRequestMentorship } from "@/modules/mentorship/application/request-mentorship";
import { createTransitionMentorship } from "@/modules/mentorship/application/transition-mentorship";
import { createSaveMentorProfile } from "@/modules/mentorship/application/save-mentor-profile";
import { createListMentorships } from "@/modules/mentorship/application/list-mentorships";
import { createListMentors } from "@/modules/mentorship/application/list-mentors";
import type { MentorshipQueries } from "@/modules/mentorship/application/mentorship-store";
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

const MENTOR = "00000000-0000-4000-8000-00000000000a";
const MENTEE = "00000000-0000-4000-8000-00000000000b";
const STRANGER = "00000000-0000-4000-8000-00000000000c";
const allowAll = { consume: async () => ({ allowed: true, retryAfter: null }) };
const status = (promise: Promise<unknown>) =>
  promise.then(
    () => 200,
    (e: { status?: number }) => e.status ?? 500
  );

function buildLifecycle() {
  const fake = createFakeMentorshipStore();
  fake.seedMentor(MENTOR, { accepting: true, maxMentees: 3, listable: true });
  return {
    ...fake,
    request: createRequestMentorship({
      store: fake.store,
      authorize,
      rateLimiter: allowAll,
    }),
    transition: createTransitionMentorship({ store: fake.store, authorize }),
  };
}

describe("requestMentorship: real authorizer", () => {
  it("no session is a 401", async () => {
    const { request } = buildLifecycle();
    expect(
      await status(
        request({ actor: null, mentorId: MENTOR, input: { message: "hi" } })
      )
    ).toBe(401);
  });

  it("ALUMNI (no mentorship.request) is a 403", async () => {
    const { request, rows } = buildLifecycle();
    expect(
      await status(
        request({
          actor: actor(MENTEE, { grants: grantsFor("ALUMNI") }),
          mentorId: MENTOR,
          input: { message: "hi" },
        })
      )
    ).toBe(403);
    expect(rows()).toHaveLength(0);
  });

  it.each(["PENDING", "REJECTED", "SUSPENDED", "DEACTIVATED"] as const)(
    "an unverified STUDENT (%s) is a 403",
    async (accountState) => {
      const { request } = buildLifecycle();
      expect(
        await status(
          request({
            actor: actor(MENTEE, {
              accountState,
              grants: grantsFor("STUDENT"),
            }),
            mentorId: MENTOR,
            input: { message: "hi" },
          })
        )
      ).toBe(403);
    }
  );

  it("a verified STUDENT may request", async () => {
    const { request, rows } = buildLifecycle();
    expect(
      await status(
        request({
          actor: actor(MENTEE, { grants: grantsFor("STUDENT") }),
          mentorId: MENTOR,
          input: { message: "hi" },
        })
      )
    ).toBe(200);
    expect(rows()).toHaveLength(1);
  });
});

describe("transitionMentorship: real authorizer", () => {
  async function requested() {
    const built = buildLifecycle();
    const { mentorshipId } = await built.request({
      actor: actor(MENTEE, { grants: grantsFor("STUDENT") }),
      mentorId: MENTOR,
      input: { message: "hi" },
    });
    return { ...built, mentorshipId };
  }
  const mentorActor = () => actor(MENTOR, { grants: grantsFor("ALUMNI") });

  it("a STUDENT calling accept is a 403", async () => {
    const { transition, mentorshipId } = await requested();
    expect(
      await status(
        transition({
          actor: actor(MENTEE, { grants: grantsFor("STUDENT") }),
          mentorshipId,
          action: "accept",
        })
      )
    ).toBe(403);
  });

  it.each(["accept", "decline", "cancel"] as const)(
    "a stranger's %s on someone else's mentorship is a 404 (IDOR)",
    async (action) => {
      const { transition, mentorshipId, rows } = await requested();
      expect(
        await status(
          transition({
            actor: actor(STRANGER, { grants: grantsFor("ALUMNI") }),
            mentorshipId,
            action,
          })
        )
      ).toBe(404);
      expect(rows()[0]?.state).toBe("REQUESTED");
    }
  );

  it("the mentee may cancel; the mentor's cancel on REQUESTED is a 409", async () => {
    const { transition, mentorshipId } = await requested();
    expect(
      await status(
        transition({ actor: mentorActor(), mentorshipId, action: "cancel" })
      )
    ).toBe(409);
    expect(
      await status(
        transition({
          actor: actor(MENTEE, { grants: grantsFor("STUDENT") }),
          mentorshipId,
          action: "cancel",
        })
      )
    ).toBe(200);
  });
});

describe("listMentorships: real authorizer", () => {
  const build = () => {
    const list = vi.fn<MentorshipQueries["list"]>(async () => []);
    return {
      list,
      run: createListMentorships({ queries: { list }, authorize }),
    };
  };

  it("no session is a 401", async () => {
    const { run, list } = build();
    expect(await status(run({ actor: null, role: "mentee" }))).toBe(401);
    expect(list).not.toHaveBeenCalled();
  });

  it("a mentor list needs mentorship.respond: STUDENT is a 403, ALUMNI is ok", async () => {
    const { run, list } = build();
    const student = actor(MENTEE, { grants: grantsFor("STUDENT") });
    expect(await status(run({ actor: student, role: "mentor" }))).toBe(403);
    const alumnus = actor(MENTOR, { grants: grantsFor("ALUMNI") });
    expect(await status(run({ actor: alumnus, role: "mentor" }))).toBe(200);
    expect(list).toHaveBeenCalledWith(
      MENTOR,
      expect.objectContaining({ role: "mentor" })
    );
  });

  it("a mentee list needs mentorship.request: ALUMNI is a 403, unverified STUDENT is a 403", async () => {
    const { run } = build();
    const alumnus = actor(MENTOR, { grants: grantsFor("ALUMNI") });
    expect(await status(run({ actor: alumnus, role: "mentee" }))).toBe(403);
    const pending = actor(MENTEE, {
      accountState: "PENDING",
      grants: grantsFor("STUDENT"),
    });
    expect(await status(run({ actor: pending, role: "mentee" }))).toBe(403);
  });

  it("only ever asks for the caller's own id", async () => {
    const { run, list } = build();
    await run({
      actor: actor(MENTEE, { grants: grantsFor("STUDENT") }),
      role: "mentee",
    });
    expect(list.mock.calls[0]![0]).toBe(MENTEE);
  });
});
