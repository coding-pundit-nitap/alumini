import { expect, test, type Browser, type Page } from "./support/test";

import { confirmEmail, register, signIn, unique } from "./support/accounts";

const DOMAIN = process.env.E2E_INSTITUTIONAL_DOMAIN ?? "nitap.ac.in";
const BASE_URL =
  process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000";

/** A distinct client address per session, so per-IP limits never span runs. */
const clientIp = () =>
  `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

/**
 * A verified member in their own browser session (institutional email: verified
 * on confirmation).
 */
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

async function setHeadline(page: Page, headline: string) {
  await page.goto("/profile");
  await page.getByLabel("Headline").fill(headline);
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();
}

async function setLevel(page: Page, label: string) {
  await page.goto("/profile/privacy");
  await page.getByLabel("Who can see your profile").selectOption({ label });
  await page.getByRole("button", { name: "Save privacy settings" }).click();
  await expect(page.getByText("Privacy settings saved.")).toBeVisible();
}

/** The member's own profile URL, read from the "View my profile" link. */
async function profilePath(page: Page): Promise<string> {
  await page.goto("/profile");
  const href = await page
    .getByRole("link", { name: "View my profile" })
    .getAttribute("href");
  return href as string;
}

test("J-06 members connect, see connections-only profiles, block and unblock", async ({
  browser,
}) => {
  const asha = await member(browser);
  const ravi = await member(browser);
  const outsider = await member(browser);

  const token = `quokka${Date.now().toString(36)}`;
  await setHeadline(ravi, `${token} engineer`);
  const raviPath = await profilePath(ravi);
  const ashaPath = await profilePath(asha);

  // Ravi's profile is for connections only: strangers cannot find or open it.
  await setLevel(ravi, "Connections");
  await asha.goto(`/directory?q=${token}`);
  await expect(asha.getByText("No members match these filters.")).toBeVisible();
  await asha.goto(raviPath);
  await expect(asha.getByText("Page not found")).toBeVisible();

  // Members can still ask: a request from the profile of a member they can see. Ravi loosens it just
  // enough for Asha to find him, asks nothing of her, and Asha sends the request.
  await setLevel(ravi, "Verified members");
  await asha.goto(`/directory?q=${token}`);
  await asha.getByRole("link", { name: new RegExp(token) }).click();
  await expect(asha).toHaveURL(new RegExp(`${raviPath}$`));
  await asha.getByRole("button", { name: "Connect" }).click();
  await expect(asha.getByText("Request sent")).toBeVisible();
  await expect(
    asha.getByRole("button", { name: "Cancel request" })
  ).toBeVisible();

  await ravi.goto("/connections?tab=incoming");
  await expect(ravi.getByRole("button", { name: "Accept" })).toBeVisible();
  await ravi.getByRole("button", { name: "Accept" }).click();
  await expect(ravi.getByText("No requests waiting for you.")).toBeVisible();
  await ravi.goto("/connections");
  await expect(ravi.getByRole("button", { name: "Remove" })).toBeVisible();
  await asha.goto(raviPath);
  await expect(asha.getByText("Connected")).toBeVisible();

  // Now the connection sees a connections-only profile that the outsider cannot.
  await setLevel(ravi, "Connections");
  await asha.goto(`/directory?q=${token}`);
  await expect(
    asha.getByRole("link", { name: new RegExp(token) })
  ).toBeVisible();
  await outsider.goto(`/directory?q=${token}`);
  await expect(
    outsider.getByText("No members match these filters.")
  ).toBeVisible();
  await outsider.goto(raviPath);
  await expect(outsider.getByText("Page not found")).toBeVisible();

  // Blocking ends the connection and hides each member from the other.
  await asha.goto(raviPath);
  await asha.getByRole("button", { name: "Block" }).click();
  await asha.getByRole("button", { name: "Confirm block" }).click();
  await expect(asha.getByText("Page not found")).toBeVisible();
  await asha.goto(`/directory?q=${token}`);
  await expect(asha.getByText("No members match these filters.")).toBeVisible();
  await ravi.goto(ashaPath);
  await expect(ravi.getByText("Page not found")).toBeVisible();

  await ravi.goto("/connections?tab=blocked");
  await expect(ravi.getByText("You have not blocked anyone.")).toBeVisible();
  await asha.goto("/connections?tab=blocked");
  await asha.getByRole("button", { name: "Unblock" }).click();
  await expect(asha.getByText("You have not blocked anyone.")).toBeVisible();
  // Unblocking does not restore the connection: Ravi's profile is still connections-only, so it stays
  // closed to Asha until he opens it up; then she can ask again.
  await asha.goto(raviPath);
  await expect(asha.getByText("Page not found")).toBeVisible();
  await setLevel(ravi, "Verified members");
  await asha.goto(raviPath);
  await expect(asha.getByRole("button", { name: "Connect" })).toBeVisible();
});
