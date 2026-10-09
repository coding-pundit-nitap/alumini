import { expect, test, type Browser, type Page } from "./support/test";

import { confirmEmail, register, signIn, unique } from "./support/accounts";

const DOMAIN = process.env.E2E_INSTITUTIONAL_DOMAIN ?? "nitap.ac.in";
const BASE_URL =
  process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000";

/** A distinct client address per session, so per-IP limits never span runs. */
const clientIp = () =>
  `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

/** A verified member in their own browser session (institutional email: verified on confirmation). */
async function member(browser: Browser): Promise<Page> {
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
  return page;
}

async function setLevel(page: Page, label: string) {
  await page.goto("/profile/privacy");
  await page.getByLabel("Who can see your profile").selectOption({ label });
  await page.getByRole("button", { name: "Save privacy settings" }).click();
  await expect(page.getByText("Privacy settings saved.")).toBeVisible();
}

test("J-05 members find each other in the directory, and private profiles stay out", async ({
  browser,
}) => {
  const owner = await member(browser);
  const viewer = await member(browser);

  const token = `zebrafish${Date.now().toString(36)}`;
  await owner.goto("/profile");
  await owner.getByLabel("Headline").fill(`${token} engineer`);
  await owner.getByRole("button", { name: "Save profile" }).click();
  await expect(owner.getByText("Profile saved.")).toBeVisible();

  await viewer.goto(`/directory?q=${token}`);
  const result = viewer.getByRole("link", { name: new RegExp(token) });
  await expect(result).toBeVisible();
  await result.click();
  await expect(viewer).toHaveURL(/\/members\/[0-9a-f-]{36}$/);

  await setLevel(owner, "Only me");
  await viewer.goto(`/directory?q=${token}`);
  await expect(
    viewer.getByText("No members match these filters.")
  ).toBeVisible();

  const guest = await (
    await browser.newContext({ baseURL: BASE_URL })
  ).newPage();
  await guest.goto("/directory");
  await expect(guest).toHaveURL(/\/login/);
});
