import { expect, test, type Browser, type Page } from "@playwright/test";

import { Pool } from "pg";

import { confirmEmail, register, signIn, unique } from "./support/accounts";

const DOMAIN = process.env.E2E_INSTITUTIONAL_DOMAIN ?? "nitap.ac.in";
const BASE_URL =
  process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000";
const clientIp = () =>
  `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

test.afterAll(async () => {
  await pool.end();
});

/** Registers, confirms and signs in; an institutional domain lands VERIFIED on /dashboard. */
async function account(
  browser: Browser,
  domain = DOMAIN
): Promise<{ page: Page; email: string }> {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { "x-forwarded-for": clientIp() },
  });
  const page = await context.newPage();
  const email = unique(domain);
  await register(page, email);
  await confirmEmail(page, email);
  await signIn(page, email);
  await expect(page).toHaveURL(
    domain === DOMAIN ? /\/dashboard$/ : /\/onboarding/
  );
  return { page, email };
}

async function grantRole(email: string, roleName: string): Promise<void> {
  await pool.query(
    `insert into user_role (user_id, role_id, granted_by)
     select u.id, role.id, u.id from "user" u, role
     where u.email = $1 and role.name = $2
     on conflict (user_id, role_id) do nothing`,
    [email, roleName]
  );
}

const primary = (page: Page) =>
  page.getByRole("navigation", { name: "Primary" });

test("a verified member's rail lists the member areas and no Admin link", async ({
  browser,
}) => {
  const { page } = await account(browser);
  const nav = primary(page);
  for (const name of ["Home", "Directory", "Connections", "Jobs", "Events"]) {
    await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
  }
  await expect(
    nav.getByRole("link", { name: "Admin", exact: true })
  ).toHaveCount(0);
});

test("an admin's rail links to the admin console", async ({ browser }) => {
  const { page, email } = await account(browser);
  await grantRole(email, "INSTITUTE_ADMIN");
  await page.reload();
  await expect(
    primary(page).getByRole("link", { name: "Admin", exact: true })
  ).toHaveAttribute("href", "/admin");
});

test("a pending user is kept out of the app and never sees the rail", async ({
  browser,
}) => {
  const { page } = await account(browser, "example.test");
  await page.goto("/directory");
  await expect(page).toHaveURL(/\/(account\/status|onboarding)/);
  await expect(primary(page)).toHaveCount(0);
});

test("signing out from the account menu ends the session", async ({
  browser,
}) => {
  const { page } = await account(browser);
  await page.getByRole("button", { name: "Account menu" }).first().click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
});

test("on a phone the bottom bar replaces the rail and More opens the full nav", async ({
  browser,
}) => {
  const { page } = await account(browser);
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = page.getByRole("navigation", { name: "Mobile" });
  await expect(mobile).toBeVisible();
  await expect(primary(page)).toBeHidden();
  // Dev-only TanStack Query devtools float over the bottom-right tab; hide them for the click.
  await page.addStyleTag({
    content: ".tsqd-parent-container { display: none !important; }",
  });
  await mobile.getByRole("button", { name: "More" }).click();
  await expect(
    page.getByRole("dialog").getByRole("link", { name: "Connections" })
  ).toBeVisible();
});

test("Ctrl+K opens the palette and jumps to a page", async ({ browser }) => {
  const { page } = await account(browser);
  const input = page.getByRole("combobox", { name: "Command palette" });
  // The shortcut listener attaches on hydration; retry the key press until it has.
  await expect(async () => {
    await page.keyboard.press("Control+K");
    await expect(input).toBeVisible({ timeout: 1000 });
  }).toPass();
  await input.fill("jobs");
  await input.press("Enter");
  await expect(page).toHaveURL(/\/jobs$/);
});
