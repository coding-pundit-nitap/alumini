import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { createPrismaMentorProfileStore } from "@/modules/mentorship/infrastructure/prisma-mentor-profile-store";
import { createPrismaMentorQueries } from "@/modules/mentorship/infrastructure/prisma-mentor-queries";

type Level = "PUBLIC" | "MEMBERS_ONLY" | "CONNECTIONS_ONLY" | "PRIVATE";

describe("mentor discovery against real PostgreSQL", () => {
  let db: TestDatabase;
  let grantor: string;
  let n = 0;

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    n = 0;
    grantor = (
      await db.prisma.user.create({
        data: {
          name: "Grantor",
          email: "grantor@example.test",
          accountState: "VERIFIED",
        },
      })
    ).id;
  });
  afterEach(async () => {
    await db.drop();
  });

  const queries = () => createPrismaMentorQueries(db.prisma);
  const store = () => createPrismaMentorProfileStore(db.prisma);

  async function member(
    name: string,
    opts: {
      role?: "STUDENT" | "ALUMNI";
      visibility?: Level;
      experienceVisibility?: Level;
      state?: "VERIFIED" | "PENDING" | "SUSPENDED";
      department?: string;
    } = {}
  ): Promise<string> {
    n += 1;
    const user = await db.prisma.user.create({
      data: {
        name,
        email: `u${n}@example.test`,
        accountState: opts.state ?? "VERIFIED",
      },
    });
    const department = opts.department
      ? await db.prisma.department.findUniqueOrThrow({
          where: { code: opts.department },
        })
      : null;
    await db.prisma.profile.create({
      data: {
        userId: user.id,
        fullName: name,
        visibility: opts.visibility ?? "MEMBERS_ONLY",
        experienceVisibility: opts.experienceVisibility,
        departmentId: department?.id,
      },
    });
    if (opts.role) {
      const role = await db.prisma.role.findUniqueOrThrow({
        where: { name: opts.role },
      });
      await db.prisma.userRole.create({
        data: { userId: user.id, roleId: role.id, grantedBy: grantor },
      });
    }
    return user.id;
  }

  const optIn = (userId: string, over: Record<string, unknown> = {}) =>
    db.prisma.mentorProfile.create({
      data: { userId, expertise: "Databases", ...over } as never,
    });

  /** Writes the pair's row directly, in canonical order, as the connections module would. */
  async function link(
    x: string,
    y: string,
    state: "ACCEPTED" | "BLOCKED",
    by = x
  ) {
    const [userAId, userBId] = [x, y].sort() as [string, string];
    await db.prisma.connection.create({
      data: {
        userAId,
        userBId,
        requestedById: by,
        state,
        blockedById: state === "BLOCKED" ? by : null,
        respondedAt: new Date(),
      },
    });
  }

  describe("list", () => {
    it("lists an ALUMNI mentor with an accepting profile to a STUDENT viewer", async () => {
      const viewer = await member("Stu", { role: "STUDENT" });
      const mentor = await member("Mentor Ana", { role: "ALUMNI" });
      await optIn(mentor);
      const ids = (await queries().list(viewer, { limit: 50 })).map(
        (c) => c.userId
      );
      expect(ids).toContain(mentor);
    });

    it("omits a mentor whose accepting is false", async () => {
      const viewer = await member("Stu2", { role: "STUDENT" });
      const mentor = await member("Paused Pat", { role: "ALUMNI" });
      await optIn(mentor, { accepting: false });
      const ids = (await queries().list(viewer, { limit: 50 })).map(
        (c) => c.userId
      );
      expect(ids).not.toContain(mentor);
    });

    it("omits a STUDENT-role mentor_profile owner (no mentorship.respond)", async () => {
      const viewer = await member("Stu3", { role: "STUDENT" });
      const notMentor = await member("Not Mentor", { role: "STUDENT" });
      await optIn(notMentor);
      const ids = (await queries().list(viewer, { limit: 50 })).map(
        (c) => c.userId
      );
      expect(ids).not.toContain(notMentor);
    });

    it("omits a mentor who is not VERIFIED", async () => {
      const viewer = await member("Stu4", { role: "STUDENT" });
      const pending = await member("Pending Pam", {
        role: "ALUMNI",
        state: "PENDING",
      });
      await optIn(pending);
      const ids = (await queries().list(viewer, { limit: 50 })).map(
        (c) => c.userId
      );
      expect(ids).not.toContain(pending);
    });

    it("omits a mentor whose profile is PRIVATE", async () => {
      const viewer = await member("Stu5", { role: "STUDENT" });
      const hidden = await member("Hidden Hal", {
        role: "ALUMNI",
        visibility: "PRIVATE",
      });
      await optIn(hidden);
      const ids = (await queries().list(viewer, { limit: 50 })).map(
        (c) => c.userId
      );
      expect(ids).not.toContain(hidden);
    });

    it("omits a CONNECTIONS_ONLY mentor without an accepted connection, and lists once connected", async () => {
      const viewer = await member("Stu6", { role: "STUDENT" });
      const circle = await member("Circle Cy", {
        role: "ALUMNI",
        visibility: "CONNECTIONS_ONLY",
      });
      await optIn(circle);
      let ids = (await queries().list(viewer, { limit: 50 })).map(
        (c) => c.userId
      );
      expect(ids).not.toContain(circle);

      await link(viewer, circle, "ACCEPTED");
      ids = (await queries().list(viewer, { limit: 50 })).map((c) => c.userId);
      expect(ids).toContain(circle);
    });

    it("omits a mentor blocked by the viewer, or who has blocked the viewer", async () => {
      const viewer = await member("Stu7", { role: "STUDENT" });

      const blockedByViewer = await member("Blocked One", { role: "ALUMNI" });
      await optIn(blockedByViewer);
      await link(viewer, blockedByViewer, "BLOCKED", viewer);

      const blockedTheViewer = await member("Blocked Two", { role: "ALUMNI" });
      await optIn(blockedTheViewer);
      await link(viewer, blockedTheViewer, "BLOCKED", blockedTheViewer);

      const ids = (await queries().list(viewer, { limit: 50 })).map(
        (c) => c.userId
      );
      expect(ids).not.toContain(blockedByViewer);
      expect(ids).not.toContain(blockedTheViewer);
    });

    it("omits the viewer themself", async () => {
      const viewer = await member("Stu8", { role: "ALUMNI" });
      await optIn(viewer);
      const ids = (await queries().list(viewer, { limit: 50 })).map(
        (c) => c.userId
      );
      expect(ids).not.toContain(viewer);
    });
  });

  describe("filters", () => {
    it("matches topic against the topics array", async () => {
      const viewer = await member("StuF1", { role: "STUDENT" });
      const rustMentor = await member("Rusty Ray", { role: "ALUMNI" });
      await optIn(rustMentor, { topics: ["rust", "go"] });
      const goOnly = await member("Go Gopal", { role: "ALUMNI" });
      await optIn(goOnly, { topics: ["go"] });

      const ids = (
        await queries().list(viewer, { limit: 50, topic: "rust" })
      ).map((c) => c.userId);
      expect(ids).toEqual([rustMentor]);
    });

    it("filters by department code", async () => {
      const viewer = await member("StuF2", { role: "STUDENT" });
      const cse = await member("CSE Mentor", {
        role: "ALUMNI",
        department: "CSE",
      });
      await optIn(cse);
      const ece = await member("ECE Mentor", {
        role: "ALUMNI",
        department: "ECE",
      });
      await optIn(ece);

      const ids = (
        await queries().list(viewer, { limit: 50, department: "CSE" })
      ).map((c) => c.userId);
      expect(ids).toEqual([cse]);
    });

    it("filters by current company, only when the experience section is visible", async () => {
      const viewer = await member("StuF3", { role: "STUDENT" });

      const acme = await member("Acme Mentor", { role: "ALUMNI" });
      await db.prisma.profileExperience.create({
        data: {
          userId: acme,
          company: "Acme Robotics",
          designation: "Engineer",
          startDate: new Date("2020-01-01"),
          isCurrent: true,
        },
      });
      await optIn(acme);

      const hiddenCompany = await member("Hidden Company Mentor", {
        role: "ALUMNI",
        experienceVisibility: "PRIVATE",
      });
      await db.prisma.profileExperience.create({
        data: {
          userId: hiddenCompany,
          company: "Acme Robotics",
          designation: "Engineer",
          startDate: new Date("2020-01-01"),
          isCurrent: true,
        },
      });
      await optIn(hiddenCompany);

      const ids = (
        await queries().list(viewer, { limit: 50, company: "acme" })
      ).map((c) => c.userId);
      expect(ids).toEqual([acme]);
    });
  });

  describe("paging", () => {
    it("pages through 5 mentors with limit 3, no duplicates, ordered by lower-cased name then id", async () => {
      const viewer = await member("StuP", { role: "STUDENT" });
      for (const name of ["Charlie", "alice", "Bob", "dave", "Eve"]) {
        const id = await member(name, { role: "ALUMNI" });
        await optIn(id);
      }
      const q = queries();
      const first = await q.list(viewer, { limit: 3 });
      expect(first).toHaveLength(3);

      const lastFirst = first.at(-1)!;
      const second = await q.list(viewer, {
        limit: 3,
        after: { key: lastFirst.sortKey, id: lastFirst.userId },
      });

      const combined = [...first, ...second];
      const seenIds = combined.map((c) => c.userId);
      expect(new Set(seenIds).size).toBe(5);
      expect(seenIds).toHaveLength(5);
      const sortKeys = combined.map((c) => c.sortKey);
      expect(sortKeys).toEqual([...sortKeys].sort());
    });
  });

  describe("upsert", () => {
    it("creates then updates the same row, createdAt unchanged and fields replaced", async () => {
      const mentor = await member("StoreOwner", { role: "ALUMNI" });
      const created = await store().upsert(mentor, {
        expertise: "Databases",
        topics: ["sql"],
        availability: "",
        preferredContactMethod: "IN_APP",
        maxMentees: 3,
        accepting: true,
      });
      const createdRow = await db.prisma.mentorProfile.findUniqueOrThrow({
        where: { userId: mentor },
      });

      const updated = await store().upsert(mentor, {
        expertise: "Distributed systems",
        topics: ["rust"],
        availability: "weekends",
        preferredContactMethod: "EMAIL",
        maxMentees: 5,
        accepting: false,
      });
      const updatedRow = await db.prisma.mentorProfile.findUniqueOrThrow({
        where: { userId: mentor },
      });

      expect(created.expertise).toBe("Databases");
      expect(updated.expertise).toBe("Distributed systems");
      expect(updated.topics).toEqual(["rust"]);
      expect(updated.accepting).toBe(false);
      expect(updatedRow.createdAt.getTime()).toBe(
        createdRow.createdAt.getTime()
      );
    });
  });
});
