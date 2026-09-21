import { describe, expect, it } from "vitest";

import { createFakeVerificationStore } from "../../../../tests/support/fake-verification-store";
import { AuthenticationError, ValidationError } from "@/lib/errors";
import type { Actor } from "../domain/actor";
import { PERMISSIONS } from "../domain/permission";
import { createAuthorization } from "./authorize";
import { encodeCursor } from "./cursor";
import {
  createListPendingVerificationRequests,
  PENDING_PAGE_SIZE,
} from "./list-pending-verification-requests";
import type { VerificationRequestRecord } from "./verification-store";

const NOW = new Date("2026-09-21T10:00:00Z");
const { authorize } = createAuthorization({
  observer: { record() {} },
  now: () => NOW,
});

const holder: Actor = {
  userId: "rev",
  accountState: "VERIFIED",
  requestId: "r",
  grants: [
    { permission: PERMISSIONS.ALUMNI_VERIFY, scope: "GLOBAL", expiresAt: null },
  ],
};
const member: Actor = { ...holder, grants: [] };

const request = (n: number): VerificationRequestRecord => ({
  id: `req-${String(n).padStart(3, "0")}`,
  userId: "u1",
  rollNumber: `R${n}`,
  departmentId: "d",
  degreeId: "g",
  graduationYear: 2019,
  supportingInfo: null,
  status: "PENDING",
  crossCheck: "NOT_CHECKED",
  reviewedBy: null,
  reviewedAt: null,
  reviewNote: null,
  createdAt: new Date(1_700_000_000_000 + n * 1000),
});

const setup = (count: number) => {
  const fake = createFakeVerificationStore({
    accounts: [
      {
        id: "u1",
        name: "Asha",
        email: "asha@gmail.test",
        accountState: "PENDING",
      },
    ],
    requests: Array.from({ length: count }, (_, i) => request(i + 1)),
  });
  return createListPendingVerificationRequests({
    store: fake.store,
    authorize,
  });
};

describe("listPendingVerificationRequests", () => {
  it("returns the oldest requests first with the applicant and evidence", async () => {
    const list = setup(3);
    const page = await list({ actor: holder });
    expect(page.items.map((i) => i.rollNumber)).toEqual(["R1", "R2", "R3"]);
    expect(page.items[0]).toMatchObject({
      applicantName: "Asha",
      applicantEmail: "asha@gmail.test",
    });
    expect(page.nextCursor).toBeNull();
  });

  it("pages without duplicates or gaps", async () => {
    const list = setup(PENDING_PAGE_SIZE + 5);

    const first = await list({ actor: holder });
    expect(first.items).toHaveLength(PENDING_PAGE_SIZE);
    expect(first.nextCursor).not.toBeNull();

    const second = await list({ actor: holder, cursor: first.nextCursor });
    expect(second.items).toHaveLength(5);
    expect(second.nextCursor).toBeNull();

    const ids = [...first.items, ...second.items].map((i) => i.id);
    expect(new Set(ids).size).toBe(PENDING_PAGE_SIZE + 5);
  });

  it("answers 404 to a member without the grant, so the queue's existence is not revealed", async () => {
    const list = setup(1);
    await expect(list({ actor: member })).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
  });

  it("answers 401 to an unauthenticated caller", async () => {
    const list = setup(1);
    await expect(list({ actor: null })).rejects.toBeInstanceOf(
      AuthenticationError
    );
  });

  it("rejects a malformed cursor", async () => {
    const list = setup(1);
    await expect(
      list({ actor: holder, cursor: "garbage!!" })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("accepts a well-formed cursor past the end", async () => {
    const list = setup(2);
    const page = await list({
      actor: holder,
      cursor: encodeCursor({
        createdAt: new Date(1_900_000_000_000),
        id: "zzz",
      }),
    });
    expect(page.items).toEqual([]);
  });
});
