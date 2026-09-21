import { describe, expect, it, vi } from "vitest";

import { PERMISSIONS } from "@nitap/database/permissions";

import {
  AuthenticationError,
  AuthorizationError,
  RateLimitedError,
  ValidationError,
} from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { createFakeMentorshipStore } from "../../../../tests/support/fake-mentorship-store";
import type { FakeMentorshipStoreOptions } from "../../../../tests/support/fake-mentorship-store";
import type { MentorshipRow } from "../domain/mentorship";
import type { Authorize } from "./authz";
import type { MentorshipObserver } from "./mentorship-store";
import { createRequestMentorship, REQUEST_RATE } from "./request-mentorship";
import { createTransitionMentorship } from "./transition-mentorship";

const MENTOR = "00000000-0000-4000-8000-00000000000a";
const MENTEE = "00000000-0000-4000-8000-00000000000b";
const STRANGER = "00000000-0000-4000-8000-00000000000c";
const now = new Date("2026-09-21T10:00:00Z");
const clock = () => now;

const actor = (userId: string): Actor => ({
  userId,
  accountState: "VERIFIED",
  requestId: "r",
  grants: [],
});
const allowAll = {
  consume: async () => ({ allowed: true, retryAfter: null }),
};

const row = (over: Partial<MentorshipRow> = {}): MentorshipRow => ({
  id: "ms-1",
  mentorId: MENTOR,
  menteeId: MENTEE,
  state: "REQUESTED",
  topic: null,
  message: "hi",
  responseNote: null,
  requestedAt: new Date("2026-09-01T00:00:00Z"),
  respondedAt: null,
  startedAt: null,
  endedAt: null,
  ...over,
});

const code = (promise: Promise<unknown>) =>
  promise.then(
    () => "resolved",
    (e: { code?: string }) => e.code ?? e.constructor.name
  );

function setup(
  seed: MentorshipRow[] = [],
  opts: FakeMentorshipStoreOptions & { observe?: MentorshipObserver } = {}
) {
  const { observe, ...storeOpts } = opts;
  const fake = createFakeMentorshipStore(seed, storeOpts);
  const asked: string[] = [];
  const authorize = ((a: Actor | null, permission: string) => {
    asked.push(permission);
    if (!a) throw new AuthenticationError();
    return a;
  }) as Authorize;
  return {
    ...fake,
    asked,
    request: createRequestMentorship({
      store: fake.store,
      authorize,
      rateLimiter: allowAll,
      observe,
    }),
    transition: createTransitionMentorship({
      store: fake.store,
      authorize,
      observe,
      now: clock,
    }),
  };
}

describe("requestMentorship", () => {
  it("creates a REQUESTED row, enqueues one mentorship.requested and reports it after commit", async () => {
    const observe = vi.fn();
    const { request, rows, events, seedMentor, asked } = setup([], { observe });
    seedMentor(MENTOR, { accepting: true, maxMentees: 3, listable: true });

    const result = await request({
      actor: actor(MENTEE),
      mentorId: MENTOR,
      input: { message: "Would you mentor me?" },
    });

    expect(rows()).toEqual([
      expect.objectContaining({
        id: result.mentorshipId,
        mentorId: MENTOR,
        menteeId: MENTEE,
        state: "REQUESTED",
      }),
    ]);
    expect(events()).toEqual([
      {
        type: "mentorship.requested",
        payload: {
          v: 1,
          mentorshipId: result.mentorshipId,
          mentorId: MENTOR,
          menteeId: MENTEE,
          actorId: MENTEE,
        },
      },
    ]);
    expect(observe).toHaveBeenCalledWith("requested", result.mentorshipId);
    expect(asked).toContain(PERMISSIONS.MENTORSHIP_REQUEST);
  });

  it("refuses a self-request (CANNOT_MENTOR_SELF) before any DB work", async () => {
    const { request, rows } = setup();
    const error = await request({
      actor: actor(MENTOR),
      mentorId: MENTOR.toUpperCase(),
      input: { message: "hi" },
    }).catch((e) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.code).toBe("CANNOT_MENTOR_SELF");
    expect(rows()).toEqual([]);
  });

  it.each([
    ["empty", ""],
    ["too long", "x".repeat(501)],
  ])(
    "refuses an invalid message (%s) as VALIDATION_FAILED",
    async (_l, message) => {
      const { request, seedMentor } = setup();
      seedMentor(MENTOR, { accepting: true, maxMentees: 3, listable: true });
      expect(
        await code(
          request({
            actor: actor(MENTEE),
            mentorId: MENTOR,
            input: { message },
          })
        )
      ).toBe("VALIDATION_FAILED");
    }
  );

  it("refuses to spend the rate limit's budget twice: RATE_LIMITED writes nothing", async () => {
    const consume = vi.fn(async () => ({ allowed: false, retryAfter: 42 }));
    const fake = createFakeMentorshipStore();
    fake.seedMentor(MENTOR, { accepting: true, maxMentees: 3, listable: true });
    const authorize = ((a: Actor | null) => a as Actor) as Authorize;
    const request = createRequestMentorship({
      store: fake.store,
      authorize,
      rateLimiter: { consume },
    });
    await expect(
      request({
        actor: actor(MENTEE),
        mentorId: MENTOR,
        input: { message: "hi" },
      })
    ).rejects.toBeInstanceOf(RateLimitedError);
    expect(consume).toHaveBeenCalledWith(
      `mentorship.create:${MENTEE}`,
      REQUEST_RATE
    );
    expect(fake.rows()).toEqual([]);
  });

  it("a mentor that was never seeded reads as NOT_FOUND", async () => {
    const { request } = setup();
    expect(
      await code(
        request({
          actor: actor(MENTEE),
          mentorId: MENTOR,
          input: { message: "hi" },
        })
      )
    ).toBe("NOT_FOUND");
  });

  it("a hidden mentor profile (listable: false) reads as NOT_FOUND", async () => {
    const { request, seedMentor } = setup();
    seedMentor(MENTOR, { accepting: true, maxMentees: 3, listable: false });
    expect(
      await code(
        request({
          actor: actor(MENTEE),
          mentorId: MENTOR,
          input: { message: "hi" },
        })
      )
    ).toBe("NOT_FOUND");
  });

  it("a paused mentor (accepting: false) is MENTOR_NOT_AVAILABLE", async () => {
    const { request, seedMentor } = setup();
    seedMentor(MENTOR, { accepting: false, maxMentees: 3, listable: true });
    expect(
      await code(
        request({
          actor: actor(MENTEE),
          mentorId: MENTOR,
          input: { message: "hi" },
        })
      )
    ).toBe("MENTOR_NOT_AVAILABLE");
  });

  it("a full mentor is MENTOR_AT_CAPACITY", async () => {
    const { request, seedMentor, harness } = setup();
    seedMentor(MENTOR, { accepting: true, maxMentees: 1, listable: true });
    harness().openSlotsTaker(MENTOR, 1);
    expect(
      await code(
        request({
          actor: actor(MENTEE),
          mentorId: MENTOR,
          input: { message: "hi" },
        })
      )
    ).toBe("MENTOR_AT_CAPACITY");
  });

  it("a second request while one is already open is MENTORSHIP_REQUEST_EXISTS", async () => {
    const { request, seedMentor, rows, events } = setup();
    seedMentor(MENTOR, { accepting: true, maxMentees: 3, listable: true });
    await request({
      actor: actor(MENTEE),
      mentorId: MENTOR,
      input: { message: "hi" },
    });
    expect(
      await code(
        request({
          actor: actor(MENTEE),
          mentorId: MENTOR,
          input: { message: "again" },
        })
      )
    ).toBe("MENTORSHIP_REQUEST_EXISTS");
    expect(rows()).toHaveLength(1);
    expect(events()).toHaveLength(1);
  });

  it("a lost race on the open pair still ends with exactly one row (MENTORSHIP_REQUEST_EXISTS)", async () => {
    let played = false;
    const { request, seedMentor, rows, events } = setup([], {
      beforeInsert(rows) {
        if (played) return;
        played = true;
        rows.set("winner", row({ id: "winner" }));
      },
    });
    seedMentor(MENTOR, { accepting: true, maxMentees: 3, listable: true });
    const outcome = await code(
      request({
        actor: actor(MENTEE),
        mentorId: MENTOR,
        input: { message: "hi" },
      })
    );
    expect(outcome).toBe("MENTORSHIP_REQUEST_EXISTS");
    expect(rows().map((r) => r.id)).toEqual(["winner"]);
    expect(events()).toEqual([]);
  });

  it("rolls the row back when the outbox write fails; no observe", async () => {
    const observe = vi.fn();
    const { request, seedMentor, rows, events } = setup([], {
      failEnqueue: true,
      observe,
    });
    seedMentor(MENTOR, { accepting: true, maxMentees: 3, listable: true });
    await expect(
      request({
        actor: actor(MENTEE),
        mentorId: MENTOR,
        input: { message: "hi" },
      })
    ).rejects.toThrow("outbox down");
    expect(rows()).toEqual([]);
    expect(events()).toEqual([]);
    expect(observe).not.toHaveBeenCalled();
  });
});

describe("transitionMentorship: authorization", () => {
  it.each([
    ["accept", "REQUESTED"],
    ["decline", "REQUESTED"],
    ["start", "ACCEPTED"],
    ["complete", "ACTIVE"],
  ] as const)("%s asks mentorship.respond", async (action, state) => {
    const { transition, seedMentor, asked } = setup([
      row({ state, respondedAt: state === "REQUESTED" ? null : now }),
    ]);
    seedMentor(MENTOR, { accepting: true, maxMentees: 3, listable: true });
    await transition({ actor: actor(MENTOR), mentorshipId: "ms-1", action });
    expect(asked).toContain(PERMISSIONS.MENTORSHIP_RESPOND);
  });

  it("cancel by the mentee asks mentor.search then mentorship.request", async () => {
    const { transition, asked } = setup([row()]);
    await transition({
      actor: actor(MENTEE),
      mentorshipId: "ms-1",
      action: "cancel",
    });
    expect(asked).toEqual([
      PERMISSIONS.MENTOR_SEARCH,
      PERMISSIONS.MENTORSHIP_REQUEST,
    ]);
  });

  it("cancel by the mentor (from ACCEPTED) asks mentor.search then mentorship.respond", async () => {
    const { transition, asked } = setup([
      row({ state: "ACCEPTED", respondedAt: now }),
    ]);
    await transition({
      actor: actor(MENTOR),
      mentorshipId: "ms-1",
      action: "cancel",
    });
    expect(asked).toEqual([
      PERMISSIONS.MENTOR_SEARCH,
      PERMISSIONS.MENTORSHIP_RESPOND,
    ]);
  });

  it("an unknown mentorship id is NOT_FOUND", async () => {
    const { transition } = setup([]);
    expect(
      await code(
        transition({
          actor: actor(MENTOR),
          mentorshipId: "nope",
          action: "accept",
        })
      )
    ).toBe("NOT_FOUND");
  });

  it("a stranger reading someone else's mentorship is NOT_FOUND (IDOR)", async () => {
    const { transition } = setup([row()]);
    expect(
      await code(
        transition({
          actor: actor(STRANGER),
          mentorshipId: "ms-1",
          action: "accept",
        })
      )
    ).toBe("NOT_FOUND");
  });

  it("a mentee attempting a mentor-only action gets 403 NOT_MENTORSHIP_MENTOR", async () => {
    const { transition } = setup([row()]);
    const error = await transition({
      actor: actor(MENTEE),
      mentorshipId: "ms-1",
      action: "accept",
    }).catch((e) => e);
    expect(error).toBeInstanceOf(AuthorizationError);
    expect(error.code).toBe("NOT_MENTORSHIP_MENTOR");
  });
});

describe("transitionMentorship: transitions", () => {
  it("accept: moves to ACCEPTED, writes mentorship.accepted and reports it", async () => {
    const observe = vi.fn();
    const { transition, seedMentor, events } = setup([row()], { observe });
    seedMentor(MENTOR, { accepting: true, maxMentees: 3, listable: true });
    const result = await transition({
      actor: actor(MENTOR),
      mentorshipId: "ms-1",
      action: "accept",
    });
    expect(result).toEqual({ state: "ACCEPTED" });
    expect(events()).toEqual([
      {
        type: "mentorship.accepted",
        payload: {
          v: 1,
          mentorshipId: "ms-1",
          mentorId: MENTOR,
          menteeId: MENTEE,
          actorId: MENTOR,
        },
      },
    ]);
    expect(observe).toHaveBeenCalledWith("accepted", "ms-1");
  });

  it("decline: stores the note, writes mentorship.declined and reports it", async () => {
    const observe = vi.fn();
    const { transition, rows, events } = setup([row()], { observe });
    const result = await transition({
      actor: actor(MENTOR),
      mentorshipId: "ms-1",
      action: "decline",
      note: "Not a good fit right now.",
    });
    expect(result).toEqual({ state: "DECLINED" });
    expect(rows()[0]?.responseNote).toBe("Not a good fit right now.");
    expect(events()).toEqual([
      {
        type: "mentorship.declined",
        payload: {
          v: 1,
          mentorshipId: "ms-1",
          mentorId: MENTOR,
          menteeId: MENTEE,
          actorId: MENTOR,
        },
      },
    ]);
    expect(observe).toHaveBeenCalledWith("declined", "ms-1");
  });

  it("a note on any action other than decline is VALIDATION_FAILED", async () => {
    const { transition } = setup([row()]);
    const error = await transition({
      actor: actor(MENTOR),
      mentorshipId: "ms-1",
      action: "accept",
      note: "unexpected",
    }).catch((e) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.code).toBe("VALIDATION_FAILED");
  });

  it("start: moves ACCEPTED to ACTIVE, writes mentorship.started and reports it", async () => {
    const observe = vi.fn();
    const { transition, events } = setup(
      [row({ state: "ACCEPTED", respondedAt: now })],
      { observe }
    );
    const result = await transition({
      actor: actor(MENTOR),
      mentorshipId: "ms-1",
      action: "start",
    });
    expect(result).toEqual({ state: "ACTIVE" });
    expect(events()).toEqual([
      {
        type: "mentorship.started",
        payload: {
          v: 1,
          mentorshipId: "ms-1",
          mentorId: MENTOR,
          menteeId: MENTEE,
          actorId: MENTOR,
        },
      },
    ]);
    expect(observe).toHaveBeenCalledWith("started", "ms-1");
  });

  it("complete: moves ACTIVE to COMPLETED, writes mentorship.completed and reports it", async () => {
    const observe = vi.fn();
    const { transition, events } = setup(
      [row({ state: "ACTIVE", respondedAt: now, startedAt: now })],
      { observe }
    );
    const result = await transition({
      actor: actor(MENTOR),
      mentorshipId: "ms-1",
      action: "complete",
    });
    expect(result).toEqual({ state: "COMPLETED" });
    expect(events()).toEqual([
      {
        type: "mentorship.completed",
        payload: {
          v: 1,
          mentorshipId: "ms-1",
          mentorId: MENTOR,
          menteeId: MENTEE,
          actorId: MENTOR,
        },
      },
    ]);
    expect(observe).toHaveBeenCalledWith("completed", "ms-1");
  });

  it("cancel: the mentee leaves a REQUESTED row, writes mentorship.cancelled and reports it", async () => {
    const observe = vi.fn();
    const { transition, events } = setup([row()], { observe });
    const result = await transition({
      actor: actor(MENTEE),
      mentorshipId: "ms-1",
      action: "cancel",
    });
    expect(result).toEqual({ state: "CANCELLED" });
    expect(events()).toEqual([
      {
        type: "mentorship.cancelled",
        payload: {
          v: 1,
          mentorshipId: "ms-1",
          mentorId: MENTOR,
          menteeId: MENTEE,
          actorId: MENTEE,
        },
      },
    ]);
    expect(observe).toHaveBeenCalledWith("cancelled", "ms-1");
  });

  it("accept at capacity is refused (MENTOR_AT_CAPACITY) and writes no event", async () => {
    const { transition, seedMentor, harness, events } = setup([row()]);
    seedMentor(MENTOR, { accepting: true, maxMentees: 1, listable: true });
    harness().openSlotsTaker(MENTOR, 1);
    expect(
      await code(
        transition({
          actor: actor(MENTOR),
          mentorshipId: "ms-1",
          action: "accept",
        })
      )
    ).toBe("MENTOR_AT_CAPACITY");
    expect(events()).toEqual([]);
  });

  it("accept racing a concurrent cancel: the guarded update fails, no event", async () => {
    const { transition, seedMentor, events } = setup([row()], {
      beforeUpdate(rows) {
        rows.get("ms-1")!.state = "CANCELLED";
      },
    });
    seedMentor(MENTOR, { accepting: true, maxMentees: 3, listable: true });
    expect(
      await code(
        transition({
          actor: actor(MENTOR),
          mentorshipId: "ms-1",
          action: "accept",
        })
      )
    ).toBe("INVALID_STATE_TRANSITION");
    expect(events()).toEqual([]);
  });

  it("rolls the state change back when the outbox write fails", async () => {
    const { transition, seedMentor, rows, events } = setup([row()], {
      failEnqueue: true,
    });
    seedMentor(MENTOR, { accepting: true, maxMentees: 3, listable: true });
    await expect(
      transition({
        actor: actor(MENTOR),
        mentorshipId: "ms-1",
        action: "accept",
      })
    ).rejects.toThrow("outbox down");
    expect(rows()[0]?.state).toBe("REQUESTED");
    expect(events()).toEqual([]);
  });
});
