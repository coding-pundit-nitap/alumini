import { expect, test, type Browser, type Page } from "./support/test";

import { Pool } from "pg";

import { confirmEmail, register, signIn, unique } from "./support/accounts";

type RoleName = "ALUMNI" | "TP_ADMIN" | "INSTITUTE_ADMIN";

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

/** Direct DB access, so this suite needs no pre-seeded admin. */
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function grantRole(email: string, roleName: RoleName): Promise<void> {
  const { rows } = await pool.query<{ id: string }>(
    'select id from "user" where email = $1',
    [email]
  );
  const id = rows[0]?.id;
  if (!id) throw new Error(`No user seeded for ${email}`);
  await pool.query(
    `insert into user_role (user_id, role_id, granted_by)
     select $1, role.id, $1 from role where role.name = $2
     on conflict (user_id, role_id) do nothing`,
    [id, roleName]
  );
}

async function submitJob(page: Page, title: string): Promise<void> {
  await page.goto("/jobs/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Company").fill("Acme");
  await page.getByLabel("Description").fill("Build reliable systems.");
  await page.getByLabel("Location").fill("Remote");
  await page.getByLabel("Experience").fill("2+ years");
  await page.getByLabel("Application link").fill("https://acme.example/apply");
  const deadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  await page.getByLabel("Deadline").fill(deadline);
  await page.getByRole("button", { name: "Post job" }).click();
  await expect(
    page.getByRole("button", { name: /Post job|Saving/ })
  ).toBeEnabled();
}

test.afterAll(async () => {
  await pool.end();
});

test("an admin sees a pending job on the dashboard, approves it, and an auditor finds the audit row", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const poster = await member(browser);
  await grantRole(poster.email, "ALUMNI"); // job.create
  const moderator = await member(browser);
  await grantRole(moderator.email, "TP_ADMIN"); // job.approve, no audit.read
  const auditor = await member(browser);
  await grantRole(auditor.email, "INSTITUTE_ADMIN"); // audit.read

  const title = `Admin E2E ${Date.now()}`;
  await submitJob(poster.page, title);

  await moderator.page.goto("/admin");
  await expect(
    moderator.page.getByRole("heading", { name: "Dashboard" })
  ).toBeVisible();
  // TP_ADMIN holds no audit.read: no audit link in the shell.
  await expect(
    moderator.page.getByRole("link", { name: "Audit log" })
  ).toHaveCount(0);
  await moderator.page
    .getByRole("link", { name: /jobs awaiting review/i })
    .click();
  // The dashboard tile links straight to /admin/jobs; /jobs/moderation is kept only
  // as a redirect target for old notification links (see admin-moderation.spec.ts).
  await expect(moderator.page).toHaveURL(/\/admin\/jobs$/);
  const pendingRow = moderator.page
    .getByRole("listitem")
    .filter({ hasText: title });
  await pendingRow.getByRole("button", { name: "Approve" }).click();
  await moderator.page.getByRole("button", { name: "Approve job" }).click();
  await expect(pendingRow).toBeHidden();

  await auditor.page.goto("/admin/audit?action=job.approved");
  await expect(
    auditor.page.getByRole("heading", { name: "Audit log" })
  ).toBeVisible();
  await expect(auditor.page.getByText(moderator.email)).toBeVisible();

  // A tampered cursor falls back to the first page, keeping the filter.
  await auditor.page.goto("/admin/audit?action=job.approved&cursor=bogus");
  await expect(auditor.page).toHaveURL(/\/admin\/audit\?action=job\.approved$/);
  await expect(auditor.page.getByText(moderator.email)).toBeVisible();

  // An invalid filter is reported, and what the admin typed is kept (not silently reset).
  await auditor.page.goto("/admin/audit?actorId=not-a-uuid");
  await expect(
    auditor.page.getByRole("alert").filter({ hasText: /actor id/i })
  ).toBeVisible();
  await expect(auditor.page.getByLabel("Actor id")).toHaveValue("not-a-uuid");
});

test("a member sees no Admin link and gets not-found at /admin and /admin/audit", async ({
  browser,
}) => {
  const { page } = await member(browser);
  await expect(
    page.getByRole("link", { name: "Admin", exact: true })
  ).toHaveCount(0);
  // The status is 200 because loading.tsx streams the response before notFound() throws.
  for (const path of ["/admin", "/admin/audit"]) {
    await page.goto(path);
    await expect(page.getByText("Page not found")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dashboard" })).toHaveCount(
      0
    );
    await expect(page.getByRole("heading", { name: "Audit log" })).toHaveCount(
      0
    );
  }
});
