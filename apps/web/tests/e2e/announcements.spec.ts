import { expect, test, type Browser, type Page } from "./support/test";

import { Pool } from "pg";

import { confirmEmail, register, signIn, unique } from "./support/accounts";

type RoleName = "ALUMNI" | "INSTITUTE_ADMIN" | "MODERATOR";

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

test.afterAll(async () => {
  await pool.end();
});

test("an institute admin publishes; a member sees it pinned and notified", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const admin = await member(browser);
  await grantRole(admin.email, "INSTITUTE_ADMIN"); // announcement.publish
  const memberUser = await member(browser);

  const title = `Convocation ${Date.now()}`;
  await admin.page.goto("/admin/announcements");
  await admin.page.getByLabel("Title").fill(title);
  await admin.page.getByLabel("Message").fill("Registration opens **Monday**.");
  await admin.page.getByRole("button", { name: "Publish" }).click();
  await admin.page.getByRole("button", { name: "Publish and notify" }).click();
  await expect(admin.page.getByRole("link", { name: title })).toBeVisible();

  await memberUser.page.goto("/dashboard");
  const pinned = memberUser.page.getByRole("region", {
    name: "Pinned announcement",
  });
  await expect(pinned.getByRole("heading", { name: title })).toBeVisible();

  // The worker fans out asynchronously (PostgreSQL → outbox → worker → notification).
  await expect(async () => {
    await memberUser.page.goto("/notifications");
    await expect(memberUser.page.getByText("New announcement")).toBeVisible();
  }).toPass({ timeout: 30_000 });
});

test("a moderator cannot open the announcements page", async ({ browser }) => {
  const moderator = await member(browser);
  await grantRole(moderator.email, "MODERATOR");
  // The status is 200 because loading.tsx streams the response before notFound() throws.
  await moderator.page.goto("/admin/announcements");
  await expect(moderator.page.getByText("Page not found")).toBeVisible();
  await expect(
    moderator.page.getByRole("heading", { name: "Announcements" })
  ).toHaveCount(0);
});
