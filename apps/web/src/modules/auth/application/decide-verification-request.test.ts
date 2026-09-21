import { describe, expect, it } from "vitest";

import { createFakeVerificationStore } from "../../../../tests/support/fake-verification-store";
import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import type { AccountState, Actor } from "../domain/actor";
import { PERMISSIONS } from "../domain/permission";
import { createAuthorization } from "./authorize";
import { createDecideVerificationRequest } from "./decide-verification-request";
import type {
  VerificationRequestRecord,
  VerificationTx,
} from "./verification-store";

const NOW = new Date("2026-09-21T10:00:00Z");
const { authorize } = createAuthorization({
  observer: { record() {} },
  now: () => NOW,
});

const reviewer = (
  userId = "rev",
  state: AccountState = "VERIFIED",
  withGrant = true
): Actor => ({
  userId,
  accountState: state,
  requestId: "req-9",
  grants: withGrant
    ? [
        {
          permission: PERMISSIONS.ALUMNI_VERIFY,
          scope: "GLOBAL",
          expiresAt: null,
        },
      ]
    : [],
});

const pending = (
  over: Partial<VerificationRequestRecord> = {}
): VerificationRequestRecord => ({
  id: "req-1",
  userId: "u1",
  rollNumber: "NITAP-2019-042",
  departmentId: "dept-1",
  degreeId: "deg-1",
  graduationYear: 2019,
  supportingInfo: null,
  status: "PENDING",
  crossCheck: "NOT_CHECKED",
  reviewedBy: null,
  reviewedAt: null,
  reviewNote: null,
  createdAt: new Date(1_700_000_000_000),
  ...over,
});

const setup = (
  over: {
    accountState?: string;
    request?: VerificationRequestRecord;
    failOn?: keyof VerificationTx;
  } = {}
) => {
  const fake = createFakeVerificationStore(
    {
      accounts: [
        {
          id: "u1",
          name: "Asha",
          email: "asha@gmail.test",
          accountState: over.accountState ?? "PENDING",
        },
        {
          id: "rev",
          name: "Ravi",
          email: "ravi@inst.test",
          accountState: "VERIFIED",
        },
      ],
      requests: [over.request ?? pending()],
    },
    { failOn: over.failOn }
  );
  const decide = createDecideVerificationRequest({
    store: fake.store,
    authorize,
    now: () => NOW,
    approvalRole: "ROLE_FOR_TEST",
  });
  return { fake, decide };
};

describe("decideVerificationRequest: approving", () => {
  it("verifies the account, grants the injected role as the reviewer, sets institutional fields, audits and emails, in ONE transaction", async () => {
    const { fake, decide } = setup();

    const result = await decide({
      actor: reviewer(),
      requestId: "req-1",
      decision: "APPROVED",
    });

    expect(result).toEqual({ outcome: "decided" });
    expect(fake.counters.transactions).toBe(1);
    expect(fake.requests.get("req-1")).toMatchObject({
      status: "APPROVED",
      reviewedBy: "rev",
      reviewedAt: NOW,
    });
    expect(fake.accounts.get("u1")?.accountState).toBe("VERIFIED");
    expect(fake.roles).toEqual([
      { userId: "u1", roleName: "ROLE_FOR_TEST", grantedBy: "rev" },
    ]);
    expect(fake.profiles.get("u1")).toEqual({
      departmentId: "dept-1",
      degreeId: "deg-1",
      graduationYear: 2019,
    });
    expect(fake.audits).toEqual([
      {
        actorId: "rev",
        action: "alumni.verified",
        targetType: "user",
        targetId: "u1",
        metadata: { requestId: "req-1", crossCheck: "NOT_CHECKED" },
      },
    ]);
    expect(fake.emails).toEqual([
      {
        v: 1,
        to: "asha@gmail.test",
        template: "verification-approved",
        params: {},
      },
    ]);
  });

  it("also verifies an account that was REJECTED before", async () => {
    const { fake, decide } = setup({ accountState: "REJECTED" });
    await decide({
      actor: reviewer(),
      requestId: "req-1",
      decision: "APPROVED",
    });
    expect(fake.accounts.get("u1")?.accountState).toBe("VERIFIED");
  });

  it("needs no note", async () => {
    const { decide } = setup();
    await expect(
      decide({
        actor: reviewer(),
        requestId: "req-1",
        decision: "APPROVED",
        note: "  ",
      })
    ).resolves.toEqual({ outcome: "decided" });
  });
});

describe("decideVerificationRequest: rejecting", () => {
  it("requires a note", async () => {
    const { fake, decide } = setup();
    await expect(
      decide({
        actor: reviewer(),
        requestId: "req-1",
        decision: "REJECTED",
        note: "  ",
      })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(fake.requests.get("req-1")?.status).toBe("PENDING");
  });

  it("marks the account REJECTED with the trimmed note, grants no role, audits and emails", async () => {
    const { fake, decide } = setup();

    await decide({
      actor: reviewer(),
      requestId: "req-1",
      decision: "REJECTED",
      note: "  Roll number not found.  ",
    });

    expect(fake.requests.get("req-1")).toMatchObject({
      status: "REJECTED",
      reviewNote: "Roll number not found.",
    });
    expect(fake.accounts.get("u1")?.accountState).toBe("REJECTED");
    expect(fake.roles).toEqual([]);
    expect(fake.profiles.size).toBe(0);
    expect(fake.audits[0]).toMatchObject({
      action: "alumni.rejected",
      targetId: "u1",
    });
    expect(fake.emails[0]).toMatchObject({
      template: "verification-rejected",
      params: {},
    });
  });

  it("keeps an already REJECTED account REJECTED when a resubmission is rejected again", async () => {
    const { fake, decide } = setup({ accountState: "REJECTED" });
    await decide({
      actor: reviewer(),
      requestId: "req-1",
      decision: "REJECTED",
      note: "Still no.",
    });
    expect(fake.accounts.get("u1")?.accountState).toBe("REJECTED");
  });

  it("never puts the reviewer's note in the email", async () => {
    const { fake, decide } = setup();
    await decide({
      actor: reviewer(),
      requestId: "req-1",
      decision: "REJECTED",
      note: "secret detail",
    });
    expect(JSON.stringify(fake.emails)).not.toContain("secret detail");
  });
});

describe("decideVerificationRequest: who may decide", () => {
  it("refuses an unauthenticated caller", async () => {
    const { decide } = setup();
    await expect(
      decide({ actor: null, requestId: "req-1", decision: "APPROVED" })
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("refuses a verified member who holds no alumni.verify grant", async () => {
    const { decide } = setup();
    await expect(
      decide({
        actor: reviewer("rev", "VERIFIED", false),
        requestId: "req-1",
        decision: "APPROVED",
      })
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it.each(["PENDING", "REJECTED", "SUSPENDED"] as const)(
    "refuses a %s account even with a forged grant",
    async (state) => {
      const { decide } = setup();
      await expect(
        decide({
          actor: reviewer("rev", state),
          requestId: "req-1",
          decision: "APPROVED",
        })
      ).rejects.toBeInstanceOf(AuthorizationError);
    }
  );

  it("forbids reviewing your own request with a specific code, and changes nothing", async () => {
    const { fake, decide } = setup({ request: pending({ userId: "rev" }) });

    await expect(
      decide({
        actor: reviewer("rev"),
        requestId: "req-1",
        decision: "APPROVED",
      })
    ).rejects.toMatchObject({ code: "SELF_REVIEW_FORBIDDEN", status: 403 });

    expect(fake.requests.get("req-1")?.status).toBe("PENDING");
    expect(fake.audits).toEqual([]);
  });

  it("answers 404 for a request that does not exist", async () => {
    const { decide } = setup();
    await expect(
      decide({ actor: reviewer(), requestId: "nope", decision: "APPROVED" })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("decideVerificationRequest: idempotence and atomicity", () => {
  it("a second decision on a decided request is a no-op with no side effects", async () => {
    const { fake, decide } = setup();
    await decide({
      actor: reviewer(),
      requestId: "req-1",
      decision: "APPROVED",
    });

    const again = await decide({
      actor: reviewer(),
      requestId: "req-1",
      decision: "APPROVED",
    });

    expect(again).toEqual({ outcome: "already_decided" });
    expect(fake.audits).toHaveLength(1);
    expect(fake.emails).toHaveLength(1);
    expect(fake.roles).toHaveLength(1);
  });

  it("reports already_decided when another reviewer wins the race for the guarded update", async () => {
    const { fake, decide } = setup();
    fake.loseDecideRace();

    const result = await decide({
      actor: reviewer(),
      requestId: "req-1",
      decision: "APPROVED",
    });

    expect(result).toEqual({ outcome: "already_decided" });
    expect(fake.audits).toEqual([]);
    expect(fake.accounts.get("u1")?.accountState).toBe("PENDING");
  });

  it("refuses to review a suspended account and leaves the request queued", async () => {
    const { fake, decide } = setup({ accountState: "SUSPENDED" });

    await expect(
      decide({ actor: reviewer(), requestId: "req-1", decision: "APPROVED" })
    ).rejects.toMatchObject({ code: "ACCOUNT_NOT_REVIEWABLE", status: 409 });

    expect(fake.requests.get("req-1")?.status).toBe("PENDING");
    expect(fake.roles).toEqual([]);
  });

  it.each([
    "setAccountState",
    "applyInstitutionalFields",
    "assignRole",
    "enqueueEmail",
    "recordAudit",
  ] as const)("rolls EVERYTHING back when %s fails", async (failOn) => {
    const { fake, decide } = setup({ failOn });

    await expect(
      decide({ actor: reviewer(), requestId: "req-1", decision: "APPROVED" })
    ).rejects.toThrow(/injected failure/);

    expect(fake.requests.get("req-1")?.status).toBe("PENDING");
    expect(fake.accounts.get("u1")?.accountState).toBe("PENDING");
    expect(fake.roles).toEqual([]);
    expect(fake.profiles.size).toBe(0);
    expect(fake.emails).toEqual([]);
    expect(fake.audits).toEqual([]);
  });
});
