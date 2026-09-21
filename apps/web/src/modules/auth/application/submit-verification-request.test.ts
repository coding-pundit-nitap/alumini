import { describe, expect, it } from "vitest";

import { createFakeVerificationStore } from "../../../../tests/support/fake-verification-store";
import {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  RateLimitedError,
} from "@/lib/errors";
import type { AccountState, Actor } from "../domain/actor";
import type { EmailPolicy } from "../domain/email-policy";
import { createAuthorization } from "./authorize";
import type { InstituteRecords } from "./institute-records";
import type { RateLimiter } from "./rate-limiter";
import {
  createSubmitVerificationRequest,
  SUBMISSIONS_PER_ACCOUNT,
  SUBMISSIONS_PER_IP,
} from "./submit-verification-request";
import type { VerificationRequestRecord } from "./verification-store";

const policy: EmailPolicy = new Map([
  ["staff.inst.test", { role: "STAFF", autoVerify: false }],
]);
const evidence = {
  rollNumber: "NITAP-2019-042",
  departmentId: "dept-1",
  degreeId: "deg-1",
  graduationYear: 2019,
  supportingInfo: "Batch of 2019",
};
const NOW = new Date("2026-09-21T10:00:00Z");
const { authorize } = createAuthorization({
  observer: { record() {} },
  now: () => NOW,
});

const actorOf = (
  accountState: AccountState = "PENDING",
  userId = "u1"
): Actor => ({
  userId,
  accountState,
  requestId: "req-1",
  grants: [],
});

const rejected = (n: number): VerificationRequestRecord => ({
  id: `old-${n}`,
  userId: "u1",
  rollNumber: "X",
  departmentId: "dept-1",
  degreeId: "deg-1",
  graduationYear: 2019,
  supportingInfo: null,
  status: "REJECTED",
  crossCheck: "NOT_CHECKED",
  reviewedBy: "rev",
  reviewedAt: NOW,
  reviewNote: "no",
  createdAt: new Date(1_700_000_000_000 + n * 1000),
});

/** A rate limiter that allows `max` calls per key, then denies with a retry hint. */
function countingLimiter(): RateLimiter & { calls: string[] } {
  const seen = new Map<string, number>();
  const calls: string[] = [];
  return {
    calls,
    async consume(key, rule) {
      calls.push(key);
      const n = (seen.get(key) ?? 0) + 1;
      seen.set(key, n);
      return n <= rule.max
        ? { allowed: true, retryAfterSeconds: null }
        : { allowed: false, retryAfterSeconds: 120 };
    },
  };
}

const setup = (
  overrides: {
    email?: string;
    requests?: VerificationRequestRecord[];
    records?: InstituteRecords;
    limiter?: ReturnType<typeof countingLimiter>;
  } = {}
) => {
  const fake = createFakeVerificationStore({
    accounts: [
      {
        id: "u1",
        name: "Asha",
        email: overrides.email ?? "asha@gmail.test",
        accountState: "PENDING",
      },
    ],
    requests: overrides.requests,
  });
  const limiter = overrides.limiter ?? countingLimiter();
  const checks: unknown[] = [];
  const submit = createSubmitVerificationRequest({
    store: fake.store,
    authorize,
    policy: () => policy,
    rateLimiter: limiter,
    instituteRecords: overrides.records ?? {
      async check(e) {
        checks.push(e);
        return "NOT_CHECKED";
      },
    },
  });
  return { fake, submit, limiter, checks };
};

const call = (
  submit: ReturnType<typeof setup>["submit"],
  actor: Actor | null,
  ip = "203.0.113.7"
) => submit({ actor, clientIp: ip, input: evidence });

describe("submitVerificationRequest", () => {
  it("creates a PENDING request for the caller with the cross-check result", async () => {
    const { fake, submit } = setup({
      records: {
        async check() {
          return "MATCH";
        },
      },
    });

    const { requestId } = await call(submit, actorOf());

    expect(fake.requests.get(requestId)).toMatchObject({
      userId: "u1",
      status: "PENDING",
      crossCheck: "MATCH",
      rollNumber: "NITAP-2019-042",
      supportingInfo: "Batch of 2019",
    });
  });

  it("runs the cross-check exactly once with the evidence, and defaults to NOT_CHECKED", async () => {
    const { fake, submit, checks } = setup();

    const { requestId } = await call(submit, actorOf());

    expect(checks).toEqual([
      {
        rollNumber: "NITAP-2019-042",
        departmentId: "dept-1",
        degreeId: "deg-1",
        graduationYear: 2019,
      },
    ]);
    expect(fake.requests.get(requestId)?.crossCheck).toBe("NOT_CHECKED");
  });

  it("accepts a REJECTED account submitting again", async () => {
    const { submit } = setup({ requests: [rejected(1)] });
    await expect(call(submit, actorOf("REJECTED"))).resolves.toHaveProperty(
      "requestId"
    );
  });

  it("refuses an unauthenticated caller", async () => {
    const { submit } = setup();
    await expect(call(submit, null)).rejects.toBeInstanceOf(
      AuthenticationError
    );
  });

  it.each(["VERIFIED", "SUSPENDED", "DEACTIVATED"] as const)(
    "refuses a %s account",
    async (state) => {
      const { fake, submit } = setup();
      await expect(call(submit, actorOf(state))).rejects.toBeInstanceOf(
        AuthorizationError
      );
      expect(fake.requests.size).toBe(0);
    }
  );

  it("refuses a second request while one is open, with a specific code", async () => {
    const { submit } = setup();
    await call(submit, actorOf());
    await expect(call(submit, actorOf())).rejects.toMatchObject({
      code: "VERIFICATION_REQUEST_OPEN",
      status: 409,
    });
  });

  it("locks an account after three rejections and does not spend rate limit on it", async () => {
    const { fake, submit, limiter } = setup({
      requests: [rejected(1), rejected(2), rejected(3)],
    });

    await expect(call(submit, actorOf("REJECTED"))).rejects.toMatchObject({
      code: "VERIFICATION_LOCKED",
      status: 403,
    });
    expect(limiter.calls).toEqual([]);
    expect(fake.requests.size).toBe(3);
  });

  it("gives a staff-domain account no evidence form", async () => {
    const { submit } = setup({ email: "prof@staff.inst.test" });
    await expect(call(submit, actorOf())).rejects.toMatchObject({
      code: "VERIFICATION_NOT_APPLICABLE",
      status: 403,
    });
  });

  it("rate-limits per account, then reports when to retry", async () => {
    const { fake, submit } = setup();
    // Three requests are allowed per account; decide each so the account is not blocked by an open one.
    for (let n = 0; n < SUBMISSIONS_PER_ACCOUNT.max; n += 1) {
      const { requestId } = await call(submit, actorOf(), `198.51.100.${n}`);
      const request = fake.requests.get(requestId)!;
      request.status = "APPROVED";
      request.reviewedBy = "rev";
      request.reviewedAt = NOW;
    }

    await expect(
      call(submit, actorOf(), "198.51.100.99")
    ).rejects.toMatchObject({
      status: 429,
      code: "RATE_LIMITED",
    });
  });

  it("rate-limits per client IP across accounts", async () => {
    const limiter = countingLimiter();
    const { submit } = setup({ limiter });
    // Burn the IP allowance under other account keys.
    for (let n = 0; n < SUBMISSIONS_PER_IP.max; n += 1) {
      await limiter.consume(
        "verification.submit:ip:203.0.113.7",
        SUBMISSIONS_PER_IP
      );
    }

    await expect(call(submit, actorOf())).rejects.toBeInstanceOf(
      RateLimitedError
    );
  });

  it("creates nothing when it is rate-limited", async () => {
    const limiter = countingLimiter();
    const { fake, submit } = setup({ limiter });
    for (let n = 0; n < SUBMISSIONS_PER_IP.max; n += 1) {
      await limiter.consume(
        "verification.submit:ip:203.0.113.7",
        SUBMISSIONS_PER_IP
      );
    }

    await call(submit, actorOf()).catch(() => undefined);

    expect(fake.requests.size).toBe(0);
  });

  it("maps a lost race on the unique index to the same conflict", async () => {
    const { submit } = setup();
    const results = await Promise.allSettled([
      call(submit, actorOf()),
      call(submit, actorOf()),
    ]);
    const failures = results.filter((r) => r.status === "rejected");
    expect(
      failures.every(
        (f) => (f as PromiseRejectedResult).reason instanceof ConflictError
      )
    ).toBe(true);
  });
});
