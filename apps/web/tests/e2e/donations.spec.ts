import { expect, test, type Browser, type Page } from "@playwright/test";

import { Pool } from "pg";

import { confirmEmail, register, signIn, unique } from "./support/accounts";

type RoleName = "ALUMNI_COORDINATOR" | "MODERATOR";

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

const istDay = (offsetDays: number) =>
  new Date(Date.now() + 5.5 * 3_600_000 + offsetDays * 86_400_000)
    .toISOString()
    .slice(0, 10);

test("a coordinator runs a campaign; a member pledges and sees it received once confirmed", async ({
  browser,
}) => {
  test.setTimeout(120_000); // two accounts and five pages, compiled on first visit in dev
  const coordinator = await memberWithRole(browser, "ALUMNI_COORDINATOR");
  const title = `Library fund ${Date.now()}`;

  await coordinator.goto("/admin/campaigns");
  await coordinator.getByRole("button", { name: "New campaign" }).click();
  const create = coordinator.getByRole("dialog");
  await create.getByLabel("Title").fill(title);
  await create.getByLabel("Purpose").fill("Books for the library");
  await create
    .getByLabel("Description")
    .fill("New books for the central library.");
  await create
    .getByLabel("Payment instructions")
    .fill("UPI: library@examplebank");
  await create.getByLabel("Goal (₹, optional)").fill("50,000");
  await create.getByLabel("Starts on").fill(istDay(0));
  await create.getByLabel("Ends on").fill(istDay(30));
  await create.getByRole("button", { name: "Create draft" }).click();
  await expect(create).toBeHidden();

  const row = coordinator.getByRole("row", { name: new RegExp(title) });
  await row.getByRole("button", { name: "Activate" }).click();
  await coordinator
    .getByRole("dialog")
    .getByRole("button", { name: "Activate" })
    .click();
  await expect(row.getByRole("button", { name: "Close" })).toBeVisible();

  // A member (the moderator role still holds donation.make) pledges with a reference.
  const member = await memberWithRole(browser, "MODERATOR");
  await member.goto("/donate");
  await member.getByRole("link", { name: new RegExp(title) }).click();
  await expect(member.getByText("UPI: library@examplebank")).toBeVisible();
  const reference = `UTR${Date.now()}`;
  await member.getByLabel("Amount (₹)").fill("2,500");
  await member.getByLabel("Payment reference (optional)").fill(reference);
  await member.getByRole("button", { name: "Record my pledge" }).click();
  await expect(member).toHaveURL(/\/donations\?pledged=1$/, {
    timeout: 20_000,
  });
  await expect(member.getByText("Awaiting confirmation")).toBeVisible();

  // The coordinator confirms it against the reference.
  await coordinator.goto("/admin/donations");
  const pledge = coordinator.getByRole("row", { name: new RegExp(reference) });
  await pledge.getByRole("button", { name: "Confirm" }).click();
  const confirm = coordinator.getByRole("dialog");
  await expect(confirm.getByLabel("Payment reference")).toHaveValue(reference);
  await confirm.getByRole("button", { name: "Confirm received" }).click();
  await expect(confirm).toBeHidden();
  await expect(pledge).toHaveCount(0); // the queue shows open pledges only

  await member.goto("/donations");
  await expect(member.getByText("Received", { exact: true })).toBeVisible();
  await member.goto("/donate");
  await expect(
    member.getByRole("link", { name: new RegExp(title) })
  ).toContainText("₹2,500 received of ₹50,000");
});

test("a member without campaign.manage gets not-found on the fundraising admin pages", async ({
  browser,
}) => {
  const page = await memberWithRole(browser, "MODERATOR");
  for (const path of ["/admin/campaigns", "/admin/donations"]) {
    await page.goto(path);
    await expect(page.getByText("Page not found")).toBeVisible();
  }
});
