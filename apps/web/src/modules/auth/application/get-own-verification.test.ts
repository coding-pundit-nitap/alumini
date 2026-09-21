import { describe, expect, it } from "vitest";

import { createFakeVerificationStore } from "../../../../tests/support/fake-verification-store";
import { AuthorizationError } from "@/lib/errors";
import type { AccountState, Actor } from "../domain/actor";
import type { EmailPolicy } from "../domain/email-policy";
import { createAuthorization } from "./authorize";
import { createGetOwnVerification } from "./get-own-verification";
import type { VerificationRequestRecord } from "./verification-store";

const NOW = new Date("2026-09-21T10:00:00Z");
const { authorize } = createAuthorization({
  observer: { record() {} },
  now: () => NOW,
});
const policy: EmailPolicy = new Map([
  ["staff.inst.test", { role: "STAFF", autoVerify: false }],
]);

const actorOf = (
  accountState: AccountState = "PENDING",
  userId = "u1"
): Actor => ({
  userId,
  accountState,
  requestId: "r",
  grants: [],
});

const record = (
  over: Partial<VerificationRequestRecord>
): VerificationRequestRecord => ({
  id: "req-1",
  userId: "u1",
  rollNumber: "R1",
  departmentId: "d",
  degreeId: "g",
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

const setup = (email: string, requests: VerificationRequestRecord[] = []) => {
  const fake = createFakeVerificationStore({
    accounts: [
      { id: "u1", name: "Asha", email, accountState: "PENDING" },
      {
        id: "u2",
        name: "Other",
        email: "other@gmail.test",
        accountState: "PENDING",
      },
    ],
    requests,
  });
  return createGetOwnVerification({
    store: fake.store,
    authorize,
    policy: () => policy,
  });
};

describe("getOwnVerification", () => {
  it("reports the evidence track and no request for a new applicant", async () => {
    const get = setup("asha@gmail.test");
    expect(await get({ actor: actorOf() })).toEqual({
      track: "EVIDENCE",
      locked: false,
      rejectedCount: 0,
      latest: null,
    });
  });

  it("reports the staff track for a domain awaiting institute confirmation", async () => {
    const get = setup("prof@staff.inst.test");
    expect((await get({ actor: actorOf() })).track).toBe(
      "AWAITING_STAFF_CONFIRMATION"
    );
  });

  it("returns only the caller's own latest request, without any reviewer identity", async () => {
    const get = setup("asha@gmail.test", [
      record({
        id: "old",
        status: "REJECTED",
        reviewedBy: "rev",
        reviewedAt: NOW,
        reviewNote: "No.",
        createdAt: new Date(1_700_000_000_000),
      }),
      record({ id: "new", createdAt: new Date(1_700_000_100_000) }),
      record({
        id: "theirs",
        userId: "u2",
        rollNumber: "SECRET",
        createdAt: new Date(1_700_000_200_000),
      }),
    ]);

    const own = await get({ actor: actorOf() });

    expect(own.latest).toMatchObject({ status: "PENDING", rollNumber: "R1" });
    expect(own.rejectedCount).toBe(1);
    expect(JSON.stringify(own)).not.toContain("SECRET");
    expect(JSON.stringify(own)).not.toContain('"rev"');
  });

  it("shows the reviewer's note on the caller's rejected request", async () => {
    const get = setup("asha@gmail.test", [
      record({
        status: "REJECTED",
        reviewedBy: "rev",
        reviewedAt: NOW,
        reviewNote: "Roll number not found.",
      }),
    ]);
    expect((await get({ actor: actorOf("REJECTED") })).latest?.reviewNote).toBe(
      "Roll number not found."
    );
  });

  it("flags a locked account after three rejections", async () => {
    const rejected = (n: number) =>
      record({
        id: `r${n}`,
        status: "REJECTED",
        reviewedBy: "rev",
        reviewedAt: NOW,
        reviewNote: "No.",
        createdAt: new Date(1_700_000_000_000 + n),
      });
    const get = setup("asha@gmail.test", [
      rejected(1),
      rejected(2),
      rejected(3),
    ]);
    expect((await get({ actor: actorOf("REJECTED") })).locked).toBe(true);
  });

  it.each(["VERIFIED", "SUSPENDED", "DEACTIVATED"] as const)(
    "refuses a %s account",
    async (state) => {
      const get = setup("asha@gmail.test");
      await expect(get({ actor: actorOf(state) })).rejects.toBeInstanceOf(
        AuthorizationError
      );
    }
  );
});
