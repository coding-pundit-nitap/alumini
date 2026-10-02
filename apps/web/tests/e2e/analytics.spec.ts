import { expect, test, type Browser, type Page } from "./support/test";

import { Pool } from "pg";

import { confirmEmail, register, signIn, unique } from "./support/accounts";

type RoleName = "INSTITUTE_ADMIN" | "MODERATOR";

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
  await pool.end();
});

test("an institute admin opens analytics from the rail, switches to 90 days and sees every section", async ({
  browser,
}) => {
  const page = await memberWithRole(browser, "INSTITUTE_ADMIN");
  await page.goto("/admin");
  await page.getByRole("link", { name: "Analytics" }).first().click();
  await expect(page).toHaveURL(/\/admin\/analytics$/);
  await expect(
    page.getByRole("heading", { name: "Analytics", level: 1 })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "30 days" })).toHaveAttribute(
    "aria-current",
    "page"
  );

  await page.getByRole("link", { name: "90 days" }).click();
  await expect(page).toHaveURL(/range=90d/);
  await expect(page.getByRole("link", { name: "90 days" })).toHaveAttribute(
    "aria-current",
    "page"
  );
  for (const section of ["Members", "Jobs", "Events", "Community"])
    await expect(
      page.getByRole("heading", { name: section, level: 2 })
    ).toBeVisible();
});

test("a moderator has no analytics.view and gets not-found", async ({
  browser,
}) => {
  const page = await memberWithRole(browser, "MODERATOR");
  await page.goto("/admin");
  await expect(page.getByRole("link", { name: "Analytics" })).toHaveCount(0);
  // 200 + not-found page, for the reason given in admin.spec.ts.
  await page.goto("/admin/analytics");
  await expect(page.getByText("Page not found")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Analytics" })).toHaveCount(0);
});
