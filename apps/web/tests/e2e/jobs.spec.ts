import { expect, test, type Browser, type Page } from "./support/test";

import { Pool } from "pg";

import { confirmEmail, register, signIn, unique } from "./support/accounts";

type RoleName = "STUDENT" | "ALUMNI" | "TP_ADMIN";

const DOMAIN = process.env.E2E_INSTITUTIONAL_DOMAIN ?? "nitap.ac.in";
const BASE_URL =
  process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000";
const clientIp = () =>
  `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

async function member(
  browser: Browser
): Promise<{ page: Page; email: string }> {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { "x-forwarded-for": clientIp() },
  });
  const page = await context.newPage();
  const email = unique(DOMAIN);
  await register(page, email);
  await confirmEmail(page, email);
  await signIn(page, email);
  await expect(page).toHaveURL(/\/dashboard$/);
  return { page, email };
}

/** Direct DB access against the dev database, so this suite needs no pre-seeded admin/coordinator role. */
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function userId(email: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    'select id from "user" where email = $1',
    [email]
  );
  if (!rows[0]) throw new Error(`No user seeded for ${email}`);
  return rows[0].id;
}

async function grantRole(email: string, roleName: RoleName): Promise<void> {
  const id = await userId(email);
  await pool.query(
    `insert into user_role (user_id, role_id, granted_by)
     select $1, role.id, $1 from role where role.name = $2
     on conflict (user_id, role_id) do nothing`,
    [id, roleName]
  );
}

/** Simulates the worker's job.expire sweep for one row, without a live worker process. */
async function forceExpire(jobId: string): Promise<void> {
  await pool.query(
    `update job set status = 'EXPIRED', deadline = current_date - 1
     where id = $1 and status = 'PUBLISHED'`,
    [jobId]
  );
}

test.afterAll(async () => {
  await pool.end();
});

test("alumni posts a job, a moderator approves it, it appears in /jobs, then expiry removes it", async ({
  browser,
}) => {
  test.setTimeout(60_000);
  const alumnus = await member(browser);
  await grantRole(alumnus.email, "ALUMNI"); // holds job.create
  const moderator = await member(browser);
  await grantRole(moderator.email, "TP_ADMIN"); // holds job.approve

  const title = `Backend Engineer ${Date.now()}`;
  await alumnus.page.goto("/jobs/new");
  await alumnus.page.getByLabel("Title").fill(title);
  await alumnus.page.getByLabel("Company").fill("Acme");
  await alumnus.page.getByLabel("Description").fill("Build reliable systems.");
  await alumnus.page.getByLabel("Location").fill("Remote");
  await alumnus.page.getByLabel("Experience").fill("2+ years");
  await alumnus.page
    .getByLabel("Application link")
    .fill("https://acme.example/apply");
  const deadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  await alumnus.page.getByLabel("Deadline").fill(deadline);
  await alumnus.page.getByRole("button", { name: "Post job" }).click();
  await expect(
    alumnus.page.getByRole("button", { name: /Post job|Saving/ })
  ).toBeEnabled();

  await alumnus.page.goto("/jobs/mine");
  await expect(alumnus.page.getByText(title)).toBeVisible();
  await expect(alumnus.page.getByText("Pending review")).toBeVisible();

  await moderator.page.goto("/jobs/moderation");
  const pendingRow = moderator.page
    .getByRole("listitem")
    .filter({ hasText: title });
  await expect(pendingRow).toBeVisible();
  await pendingRow.getByRole("button", { name: "Approve" }).click();
  await moderator.page.getByRole("button", { name: "Approve job" }).click();
  await expect(pendingRow).toBeHidden();

  await alumnus.page.goto("/jobs");
  await expect(alumnus.page.getByText(title)).toBeVisible();

  const { rows } = await pool.query<{ id: string }>(
    "select id from job where title = $1",
    [title]
  );
  await forceExpire(rows[0]!.id);

  await alumnus.page.goto("/jobs");
  await expect(alumnus.page.getByText(title)).toBeHidden();
});

test("alumni posts a job, a moderator rejects with a note, the alumnus edits and resubmits, then it is approved", async ({
  browser,
}) => {
  test.setTimeout(60_000);
  const alumnus = await member(browser);
  await grantRole(alumnus.email, "ALUMNI");
  const moderator = await member(browser);
  await grantRole(moderator.email, "TP_ADMIN");

  const title = `Data Analyst ${Date.now()}`;
  await alumnus.page.goto("/jobs/new");
  await alumnus.page.getByLabel("Title").fill(title);
  await alumnus.page.getByLabel("Company").fill("Acme");
  await alumnus.page.getByLabel("Description").fill("Analyze things.");
  await alumnus.page.getByLabel("Location").fill("Remote");
  await alumnus.page.getByLabel("Experience").fill("1+ years");
  await alumnus.page
    .getByLabel("Application link")
    .fill("https://acme.example/apply-analyst");
  const deadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  await alumnus.page.getByLabel("Deadline").fill(deadline);
  await alumnus.page.getByRole("button", { name: "Post job" }).click();
  await expect(
    alumnus.page.getByRole("button", { name: /Post job|Saving/ })
  ).toBeEnabled();

  await moderator.page.goto("/jobs/moderation");
  const pendingRow = moderator.page
    .getByRole("listitem")
    .filter({ hasText: title });
  await expect(pendingRow).toBeVisible();
  await pendingRow.getByRole("button", { name: "Reject" }).click();
  await moderator.page.getByLabel("Reason").fill("Please add a salary range");
  await moderator.page
    .getByRole("button", { name: "Submit rejection" })
    .click();
  // The modal aria-hides <main>, so the row reads as hidden before the reject commits.
  await expect(moderator.page.getByRole("dialog")).toBeHidden();
  await expect(pendingRow).toBeHidden();

  await alumnus.page.goto("/jobs/mine");
  await expect(alumnus.page.getByText("Rejected")).toBeVisible();
  await expect(
    alumnus.page.getByText("Please add a salary range")
  ).toBeVisible();
  await alumnus.page.getByRole("link", { name: "Edit" }).first().click();
  await alumnus.page
    .getByLabel("Description")
    .fill("Analyze things. Salary: 8-12 LPA.");
  await alumnus.page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    alumnus.page.getByRole("button", { name: /Save changes|Saving/ })
  ).toBeEnabled();

  await alumnus.page.goto("/jobs/mine");
  await expect(alumnus.page.getByText("Pending review")).toBeVisible();

  await moderator.page.goto("/jobs/moderation");
  const resubmittedRow = moderator.page
    .getByRole("listitem")
    .filter({ hasText: title });
  await resubmittedRow.getByRole("button", { name: "Approve" }).click();
  await moderator.page.getByRole("button", { name: "Approve job" }).click();
  await expect(resubmittedRow).toBeHidden();

  await alumnus.page.goto("/jobs");
  await expect(alumnus.page.getByText(title)).toBeVisible();
});
