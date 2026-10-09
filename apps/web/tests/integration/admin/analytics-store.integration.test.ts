import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { createGetAnalytics } from "@/modules/admin";
import { analyticsWindow } from "@/modules/admin/domain/analytics";
import { createPrismaAnalyticsStore } from "@/modules/admin/server";

// A fixed "now" a year and more in the past, so rows the seed creates at the real now fall outside the window.
const NOW = new Date("2025-03-12T06:00:00Z");
const W = analyticsWindow("30d", NOW);
const OLD = new Date("2024-01-01T00:00:00Z");
// Sunday 18:00 UTC is Sunday 23:30 IST (week of Mon 3 Mar); Sunday 19:00 UTC is Monday 00:30 IST (week of 10 Mar).
const SUN_LATE_IST = new Date("2025-03-09T18:00:00Z");
const MON_EARLY_IST = new Date("2025-03-09T19:00:00Z");
const hours = (at: Date, h: number) => new Date(at.getTime() + h * 3_600_000);

describe("PrismaAnalyticsStore", () => {
  let db: TestDatabase;
  let store: ReturnType<typeof createPrismaAnalyticsStore>;
  let n = 0;

  const user = async (
    createdAt: Date,
    accountState: "VERIFIED" | "PENDING" = "VERIFIED"
  ) =>
    (
      await db.prisma.user.create({
        data: {
          name: `u${++n}`,
          email: `u${n}@example.test`,
          accountState,
          createdAt,
        },
      })
    ).id;

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    store = createPrismaAnalyticsStore(db.prisma);
  });
  afterEach(() => db.drop());

  it("members: IST week buckets, roles, graduation years and verification turnaround", async () => {
    const a = await user(MON_EARLY_IST);
    const b = await user(MON_EARLY_IST);
    const c = await user(SUN_LATE_IST);
    await user(OLD);
    const reviewer = await user(OLD);

    const { id: roleId } = await db.prisma.role.findUniqueOrThrow({
      where: { name: "TP_ADMIN" },
    });
    for (const userId of [a, b, c])
      await db.prisma.userRole.create({
        data: { userId, roleId, grantedBy: reviewer },
      });

    const dept = await db.prisma.department.findFirstOrThrow();
    const degree = await db.prisma.degree.findFirstOrThrow();
    const request = (
      userId: string,
      graduationYear: number,
      status: "APPROVED" | "REJECTED",
      createdAt: Date,
      turnaroundHours: number
    ) =>
      db.prisma.verificationRequest.create({
        data: {
          userId,
          rollNumber: `R${++n}`,
          departmentId: dept.id,
          degreeId: degree.id,
          graduationYear,
          status,
          reviewedBy: reviewer,
          reviewedAt: hours(createdAt, turnaroundHours),
          reviewNote: status === "REJECTED" ? "Not on the roll" : null,
          createdAt,
        },
      });
    await request(a, 2018, "APPROVED", MON_EARLY_IST, 2);
    await request(b, 2018, "APPROVED", MON_EARLY_IST, 4);
    await request(c, 2020, "REJECTED", MON_EARLY_IST, 10);
    // Decided before the window: counts toward graduation years (who is an alumnus now), not turnaround.
    await request(c, 2020, "APPROVED", OLD, 1);

    const raw = await store.membersSection(W);
    expect(raw.signups).toEqual(
      expect.arrayContaining([
        { week: "2025-03-10", value: 2 },
        { week: "2025-03-03", value: 1 },
      ])
    );
    expect(raw.signups).toHaveLength(2);
    expect(raw.byRole).toContainEqual({ key: "TP_ADMIN", value: 3 });
    expect(raw.byGraduationYear).toEqual([
      { key: "2018", value: 2 },
      { key: "2020", value: 1 },
    ]);
    expect(raw.verification).toEqual({
      approved: 2,
      rejected: 1,
      medianHoursToReview: 4,
    });
    expect(raw.byState.VERIFIED).toBeGreaterThanOrEqual(5);

    // Through the use case, the role bucket of 3 is suppressed.
    const get = createGetAnalytics({
      store,
      authorize: (actor) => actor!,
      can: () => true,
      now: () => NOW,
    });
    const { sections } = await get({
      actor: {
        userId: reviewer,
        accountState: "VERIFIED",
        requestId: "r",
        grants: [],
      },
    });
    const members = sections.find((s) => s.key === "members");
    expect(members?.status).toBe("ok");
    if (members?.key === "members" && members.status === "ok")
      expect(members.data.byRole).toContainEqual({
        key: "TP_ADMIN",
        count: { masked: true },
      });
  });

  it("jobs: weekly submissions, status in range, open by employment type", async () => {
    const poster = await user(OLD);
    const job = (
      createdAt: Date,
      status: "PENDING_REVIEW" | "PUBLISHED" | "REJECTED",
      employmentType: "FULL_TIME" | "INTERNSHIP",
      deadline: string
    ) =>
      db.prisma.job.create({
        data: {
          postedBy: poster,
          title: "Engineer",
          company: "Acme",
          description: "Build things",
          employmentType,
          location: "Remote",
          workMode: "REMOTE",
          experience: "0-2",
          applicationUrl: "https://example.test/apply",
          deadline: new Date(`${deadline}T00:00:00Z`),
          status,
          reviewNote: status === "REJECTED" ? "Off-topic" : null,
          createdAt,
        },
      });
    await job(MON_EARLY_IST, "PUBLISHED", "FULL_TIME", "2025-04-01");
    await job(MON_EARLY_IST, "REJECTED", "FULL_TIME", "2025-04-01");
    await job(SUN_LATE_IST, "PENDING_REVIEW", "INTERNSHIP", "2025-04-01");
    // Published long ago and still open; and one whose IST deadline (yesterday) has passed.
    await job(OLD, "PUBLISHED", "INTERNSHIP", "2025-03-12");
    await job(OLD, "PUBLISHED", "INTERNSHIP", "2025-03-11");

    const raw = await store.jobsSection(W);
    expect(raw.submitted).toEqual(
      expect.arrayContaining([
        { week: "2025-03-10", value: 2 },
        { week: "2025-03-03", value: 1 },
      ])
    );
    expect(raw.byStatus).toEqual([
      { key: "PENDING_REVIEW", value: 1 },
      { key: "PUBLISHED", value: 1 },
      { key: "REJECTED", value: 1 },
    ]);
    expect(raw.openByEmploymentType).toEqual([
      { key: "FULL_TIME", value: 1 },
      { key: "INTERNSHIP", value: 1 },
    ]);
  });

  it("events: held vs cancelled, registrations, fill rate, upcoming", async () => {
    const organizer = await user(OLD);
    const attendee = await user(OLD);
    const other = await user(OLD);
    const event = (
      startsAt: Date,
      capacity: number,
      registeredCount: number,
      cancelled = false
    ) =>
      db.prisma.event.create({
        data: {
          organizerId: organizer,
          title: "Meetup",
          description: "A meetup for everyone",
          startsAt,
          timezone: "Asia/Kolkata",
          isOnline: true,
          capacity,
          registeredCount,
          registrationDeadline: startsAt,
          status: cancelled ? "CANCELLED" : "SCHEDULED",
          cancelledAt: cancelled ? startsAt : null,
        },
      });
    const half = await event(MON_EARLY_IST, 10, 5);
    await event(SUN_LATE_IST, 4, 4);
    await event(SUN_LATE_IST, 4, 0, true);
    await event(hours(NOW, 48), 10, 0);
    await event(OLD, 10, 10);

    await db.prisma.eventRegistration.create({
      data: { eventId: half.id, userId: attendee, registeredAt: SUN_LATE_IST },
    });
    await db.prisma.eventRegistration.create({
      data: {
        eventId: half.id,
        userId: other,
        state: "CANCELLED",
        registeredAt: SUN_LATE_IST,
      },
    });

    expect(await store.eventsSection(W)).toEqual({
      held: 2,
      cancelled: 1,
      registrations: 1,
      averageFillRate: 0.75,
      upcoming: 1,
    });
  });

  it("community: non-deleted posts and comments per week, reports by status", async () => {
    const author = await user(OLD);
    const post = await db.prisma.post.create({
      data: { authorId: author, content: "hello", createdAt: MON_EARLY_IST },
    });
    await db.prisma.post.create({
      data: {
        authorId: author,
        content: "gone",
        deleted: true,
        createdAt: MON_EARLY_IST,
      },
    });
    await db.prisma.comment.create({
      data: {
        postId: post.id,
        authorId: author,
        body: "hi",
        createdAt: SUN_LATE_IST,
      },
    });
    await db.prisma.report.create({
      data: {
        reporterId: author,
        targetType: "POST",
        targetId: post.id,
        reason: "spam",
        createdAt: MON_EARLY_IST,
      },
    });

    const raw = await store.communitySection(W);
    expect(raw.posts).toEqual([{ week: "2025-03-10", value: 1 }]);
    expect(raw.comments).toEqual([{ week: "2025-03-03", value: 1 }]);
    expect(raw.reportsByStatus).toEqual([{ key: "OPEN", value: 1 }]);
  });
});
