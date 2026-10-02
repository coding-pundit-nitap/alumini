import { expect, test, type Browser, type Page } from "./support/test";

import { Pool } from "pg";

import { confirmEmail, register, signIn, unique } from "./support/accounts";

type RoleName = "SUPER_ADMIN" | "INSTITUTE_ADMIN";

const DOMAIN = process.env.E2E_INSTITUTIONAL_DOMAIN ?? "nitap.ac.in";
const BASE_URL =
  process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000";
const clientIp = () =>
  `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

/** Direct DB access, so this suite needs no pre-seeded admin (same approach as admin.spec.ts). */
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function memberWithRole(
  browser: Browser,
  roleName: RoleName
): Promise<Page> {
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
  await pool.query(
    `insert into user_role (user_id, role_id, granted_by)
     select u.id, role.id, u.id from "user" u, role
      where u.email = $1 and role.name = $2
     on conflict (user_id, role_id) do nothing`,
    [email, roleName]
  );
  return page;
}

test.afterAll(async () => {
  // The edit below changes a live setting the dev worker's sweep reads: put the placeholder back.
  await pool.query(
    `update retention_setting set retention_days = 90, approved_by = null, updated_by = null
      where category = 'notifications'`
  );
  await pool.end();
});

test("a super admin edits the notifications period with a sign-off and sees it", async ({
  browser,
}) => {
  const page = await memberWithRole(browser, "SUPER_ADMIN");
  await page.goto("/admin");
  await page.getByRole("link", { name: "Settings" }).first().click();
  await expect(page).toHaveURL(/\/admin\/settings$/);

  const row = page.getByRole("row", { name: /^Notifications/ });
  await row.getByRole("button", { name: "Edit" }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByLabel("Days").fill("3");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByRole("alert")).toContainText("At least 7 days");

  const days = String(100 + Math.floor(Math.random() * 800));
  await dialog.getByLabel("Days").fill(days);
  await dialog.getByLabel("Approved by").fill("Registrar, E2E");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await expect(row).toContainText(days);
  await expect(row).toContainText("Registrar, E2E");
});

test("an institute admin has no system.configure and gets not-found", async ({
  browser,
}) => {
  const page = await memberWithRole(browser, "INSTITUTE_ADMIN");
  await page.goto("/admin");
  await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);
  // 200 + not-found page, for the reason given in admin.spec.ts.
  await page.goto("/admin/settings");
  await expect(page.getByText("Page not found")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Settings" })).toHaveCount(0);
});
