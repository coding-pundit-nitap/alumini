import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { createPrismaMentorshipQueries } from "@/modules/mentorship/infrastructure/prisma-mentorship-queries";

describe("own mentorship lists against real PostgreSQL", () => {
  let db: TestDatabase;
  let n = 0;
  const queries = () => createPrismaMentorshipQueries(db.prisma);

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    n = 0;
  });
  afterEach(async () => {
    await db.drop();
  });

  async function user(name: string, photo = false) {
    n += 1;
    const created = await db.prisma.user.create({
      data: { name, email: `u${n}@example.test`, accountState: "VERIFIED" },
    });
    await db.prisma.profile.create({
      data: { userId: created.id, fullName: name, visibility: "MEMBERS_ONLY" },
    });
    if (photo) {
      const upload = await db.prisma.upload.create({
        data: {
          ownerId: created.id,
          purpose: "PROFILE_PHOTO",
          objectKey: `avatars/k${n}.png`,
          mime: "image/png",
          size: 1,
          status: "READY",
        },
      });
      await db.prisma.profile.update({
        where: { userId: created.id },
        data: { photoUploadId: upload.id },
      });
    }
    return created.id;
  }

  /** `at` seconds after a fixed base, so the order is explicit. Each row needs a distinct (mentor, mentee) pair or a closed state. */
  async function row(
    mentorId: string,
    menteeId: string,
    at: number,
    state: "REQUESTED" | "ACCEPTED" | "ACTIVE" | "COMPLETED" = "REQUESTED"
  ) {
    const requestedAt = new Date(Date.UTC(2026, 8, 1, 0, 0, at));
    const responded = state === "REQUESTED" ? null : requestedAt;
    return db.prisma.mentorship.create({
      data: {
        mentorId,
        menteeId,
        state,
        message: `msg ${at}`,
        requestedAt,
        respondedAt: responded,
        startedAt:
          state === "ACTIVE" || state === "COMPLETED" ? requestedAt : null,
        endedAt: state === "COMPLETED" ? requestedAt : null,
      },
    });
  }

  it("a mentor sees only their own rows, a student only theirs; a third party sees none", async () => {
    const m1 = await user("M1");
    const m2 = await user("M2");
    const s1 = await user("S1");
    const s2 = await user("S2");
    const a = await row(m1, s1, 1);
    const b = await row(m2, s2, 2);

    expect(
      (await queries().list(m1, { role: "mentor", limit: 50 })).map((r) => r.id)
    ).toEqual([a.id]);
    expect(
      (await queries().list(s2, { role: "mentee", limit: 50 })).map((r) => r.id)
    ).toEqual([b.id]);
    // Asking for the wrong side of someone else's row returns nothing.
    expect(await queries().list(s1, { role: "mentor", limit: 50 })).toEqual([]);
    const third = await user("T");
    expect(await queries().list(third, { role: "mentor", limit: 50 })).toEqual(
      []
    );
    expect(await queries().list(third, { role: "mentee", limit: 50 })).toEqual(
      []
    );
  });

  it("newest request first, keyset paging across 5 rows without duplicates", async () => {
    const m = await user("M");
    const ids: string[] = [];
    for (let i = 1; i <= 5; i++) {
      ids.push((await row(m, await user(`S${i}`), i)).id);
    }
    const expected = [...ids].reverse();

    const seen: string[] = [];
    let after: { key: string; id: string } | undefined;
    for (let guard = 0; guard < 5; guard++) {
      const page = await queries().list(m, { role: "mentor", limit: 3, after });
      const kept = page.slice(0, 2);
      seen.push(...kept.map((r) => r.id));
      if (page.length <= 2) break;
      const last = kept.at(-1)!;
      after = { key: last.requestedAt.toISOString(), id: last.id };
    }
    expect(seen).toEqual(expected);
  });

  it("filters by state", async () => {
    const m = await user("M");
    await row(m, await user("S1"), 1, "REQUESTED");
    const accepted = await row(m, await user("S2"), 2, "ACCEPTED");
    const active = await row(m, await user("S3"), 3, "ACTIVE");
    await row(m, await user("S4"), 4, "COMPLETED");

    const got = await queries().list(m, {
      role: "mentor",
      states: ["ACCEPTED", "ACTIVE"],
      limit: 50,
    });
    expect(got.map((r) => r.id)).toEqual([active.id, accepted.id]);
  });

  it("the counterparty is the other side, with name and a photo flag", async () => {
    const m = await user("Mentor Mary", true);
    const s = await user("Student Sam");
    await row(m, s, 1);

    const [asMentor] = await queries().list(m, { role: "mentor", limit: 50 });
    expect(asMentor!.counterparty).toEqual({
      id: s,
      fullName: "Student Sam",
      hasPhoto: false,
    });
    const [asMentee] = await queries().list(s, { role: "mentee", limit: 50 });
    expect(asMentee!.counterparty).toEqual({
      id: m,
      fullName: "Mentor Mary",
      hasPhoto: true,
    });
    expect(asMentee!.message).toBe("msg 1");
  });
});
