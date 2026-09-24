import { expect, test, type Browser, type Page } from "@playwright/test";

import { Pool } from "pg";

import { confirmEmail, register, signIn, unique } from "./support/accounts";

type RoleName = "ALUMNI" | "TP_ADMIN" | "INSTITUTE_ADMIN" | "SUPER_ADMIN";

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
  await expect(page).toHaveURL(/\/$/);
  return { page, email };
}

/** Direct DB access, so this suite needs no pre-seeded admin (same approach as admin.spec.ts). */
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

/** Every registered name is "E2E Person", so the row is found by email and its name link opened. */
async function openUser(page: Page, email: string): Promise<void> {
  await page.goto(`/admin/users?q=${encodeURIComponent(email)}`);
  await page
    .getByRole("row")
    .filter({ hasText: email })
    .getByRole("link")
    .click();
  await expect(page).toHaveURL(/\/admin\/users\/[0-9a-f-]{36}$/);
}

const stateBadge = (page: Page) => page.getByRole("heading", { level: 1 });

test.afterAll(async () => {
  await pool.end();
});

test("an Institute Admin suspends and reinstates a member; the member is signed out", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const admin = await member(browser);
  await grantRole(admin.email, "INSTITUTE_ADMIN");
  const target = await member(browser);
  await grantRole(target.email, "ALUMNI");
  // A page that needs an actor: signed out it redirects to /login, suspended-but-signed-in to /account/status.
  await target.page.goto("/profile");
  await expect(target.page).toHaveURL(/\/profile$/);

  await openUser(admin.page, target.email);
  await expect(stateBadge(admin.page)).toContainText("Verified");
  await admin.page
    .getByRole("button", { name: "Suspend", exact: true })
    .click();
  const confirm = admin.page.getByRole("button", { name: /^Suspend .+/ });
  await expect(confirm).toBeDisabled(); // a reason is required
  await admin.page.getByLabel("Reason").selectOption("SPAM");
  await confirm.click();
  await expect(stateBadge(admin.page)).toContainText("Suspended");

  // Review focus 5: the open tab's next request is signed out (the session row is gone).
  await target.page.reload();
  await expect(target.page).toHaveURL(/\/login/);
  await signIn(target.page, target.email);
  await expect(target.page).toHaveURL(/\/account\/status/);

  await admin.page
    .getByRole("button", { name: "Reinstate", exact: true })
    .click();
  await admin.page.getByRole("button", { name: /^Reinstate .+/ }).click();
  await expect(stateBadge(admin.page)).toContainText("Verified");
});

test("an Institute Admin cannot assign INSTITUTE_ADMIN and cannot change their own access", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const admin = await member(browser);
  await grantRole(admin.email, "INSTITUTE_ADMIN");
  const target = await member(browser);

  await openUser(admin.page, target.email);
  await admin.page.getByRole("tab", { name: "Roles & access" }).click();
  await admin.page.getByRole("button", { name: "Assign role" }).click();
  const option = admin.page
    .getByLabel("Role")
    .locator("option", { hasText: "INSTITUTE_ADMIN" });
  await expect(option).toBeDisabled();
  await expect(option).toContainText("Only a Super Admin");
  await admin.page.getByRole("button", { name: "Cancel" }).click();

  // Review focus 3: on their own page no action is offered.
  await openUser(admin.page, admin.email);
  const selfNote = (panel: string) =>
    admin.page
      .getByRole("tabpanel", { name: panel })
      .getByText("You can't change your own access.");
  await expect(selfNote("Overview")).toBeVisible();
  await expect(admin.page.getByRole("button", { name: "Suspend" })).toHaveCount(
    0
  );
  await expect(
    admin.page.getByRole("button", { name: "Deactivate" })
  ).toHaveCount(0);
  await admin.page.getByRole("tab", { name: "Roles & access" }).click();
  await expect(selfNote("Roles & access")).toBeVisible();
  await expect(
    admin.page.getByRole("button", { name: "Assign role" })
  ).toHaveCount(0);
});
