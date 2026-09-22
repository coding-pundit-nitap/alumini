import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runSeed } from "@nitap/database/seed";
import {
  createTestDatabase,
  expectConstraintViolation,
  type TestDatabase,
} from "@nitap/testing";

describe("job table (real PostgreSQL)", () => {
  let db: TestDatabase;
  let poster: string;

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    poster = (
      await db.prisma.user.create({
        data: { name: "Poster", email: "poster@example.test" },
      })
    ).id;
  });
  afterEach(async () => {
    await db.drop();
  });

  const row = (over: Record<string, unknown> = {}) => ({
    postedBy: poster,
    title: "Backend Engineer",
    company: "Acme",
    description: "Build things",
    employmentType: "FULL_TIME",
    location: "Remote",
    workMode: "REMOTE",
    experience: "2+ years",
    applicationUrl: "https://acme.example/apply",
    deadline: new Date("2026-12-01"),
    ...over,
  });
  const violation = (data: Record<string, unknown>) =>
    db.prisma.job.create({ data: data as never }).catch((e) => e);

  it("accepts a normal posting", async () => {
    const created = await db.prisma.job.create({ data: row() as never });
    expect(created).toMatchObject({ status: "PENDING_REVIEW" });
  });

  it("requires a review_note on REJECTED (ck_job_reject_note)", async () => {
    expectConstraintViolation(
      await violation(
        row({ status: "REJECTED", reviewedBy: poster, reviewedAt: new Date() })
      ),
      "ck_job_reject_note"
    );
    const ok = await db.prisma.job.create({
      data: row({
        status: "REJECTED",
        reviewedBy: poster,
        reviewedAt: new Date(),
        reviewNote: "Add detail",
      }) as never,
    });
    expect(ok.status).toBe("REJECTED");
  });

  it("requires an https application_url (ck_job_application_url)", async () => {
    for (const applicationUrl of [
      "http://acme.example",
      "javascript:alert(1)",
      "ftp://acme.example",
    ]) {
      expectConstraintViolation(
        await violation(row({ applicationUrl })),
        "ck_job_application_url"
      );
    }
  });

  it("bounds title/company/description length", async () => {
    expectConstraintViolation(
      await violation(row({ title: "" })),
      "ck_job_title"
    );
    expectConstraintViolation(
      await violation(row({ title: "x".repeat(201) })),
      "ck_job_title"
    );
    expectConstraintViolation(
      await violation(row({ company: "" })),
      "ck_job_company"
    );
    expectConstraintViolation(
      await violation(row({ description: "" })),
      "ck_job_description"
    );
  });

  it("caps skills at 20 (ck_job_skills_count)", async () => {
    expectConstraintViolation(
      await violation(
        row({ skills: Array.from({ length: 21 }, (_, i) => `s${i}`) })
      ),
      "ck_job_skills_count"
    );
  });
});
