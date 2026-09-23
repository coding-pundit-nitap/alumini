import { expect, test, type Browser, type Page } from "@playwright/test";

import { confirmEmail, register, signIn, unique } from "./support/accounts";
import { countEmails } from "./support/mailpit";

const DOMAIN = process.env.E2E_INSTITUTIONAL_DOMAIN ?? "nitap.ac.in";
const BASE_URL =
  process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000";

const clientIp = () =>
  `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

/** A verified member in their own browser session, with the address used to sign up. */
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

async function setLevel(page: Page, label: string) {
  await page.goto("/profile/privacy");
  await page.getByLabel("Who can see your profile").selectOption({ label });
  await page.getByRole("button", { name: "Save privacy settings" }).click();
  await expect(page.getByText("Privacy settings saved.")).toBeVisible();
}

async function profilePath(page: Page): Promise<string> {
  await page.goto("/profile");
  return (await page
    .getByRole("link", { name: "View my profile" })
    .getAttribute("href")) as string;
}

test("a connection acceptance shows up in the bell without a reload, and in /notifications", async ({
  browser,
}) => {
  const { page: asha } = await member(browser);
  const { page: ravi } = await member(browser);
  await setLevel(ravi, "Verified members");
  const raviPath = await profilePath(ravi);

  // Asha requests the connection and stays put — the bell (site-wide header) is already mounted, so
  // whatever happens next must reach her without a reload.
  await asha.goto(raviPath);
  await asha.getByRole("button", { name: "Connect" }).click();
  await expect(asha.getByText("Request sent")).toBeVisible();
  await expect(
    asha.getByRole("button", { name: "Notifications" })
  ).toBeVisible();

  // Ravi accepts from his own session.
  await ravi.goto("/connections?tab=incoming");
  await ravi.getByRole("button", { name: "Accept" }).click();
  await expect(ravi.getByText("No requests waiting for you.")).toBeVisible();

  // Back on Asha's still-open page: the bell badge increments via the SSE hint, not a reload.
  await expect(asha.getByTestId("unread-badge")).toHaveText("1", {
    timeout: 15_000,
  });
  await asha.getByRole("button", { name: "Notifications" }).click();
  await expect(asha.getByText("connection accepted")).toBeVisible();

  // And it's listed on the full inbox page too.
  await asha.goto("/notifications");
  await expect(asha.getByText("connection accepted")).toBeVisible();
});

test("disabling email preference for a category results in in-app-only delivery", async ({
  browser,
}) => {
  const { page: asha, email: ashaEmail } = await member(browser);
  const { page: ravi } = await member(browser);
  await setLevel(ravi, "Verified members");
  const raviPath = await profilePath(ravi);

  // Asha turns connection emails off before anything happens.
  await asha.goto("/settings/notifications");
  const connectionToggle = asha.getByRole("switch", { name: "connection" });
  await connectionToggle.click();
  await expect(connectionToggle).not.toBeChecked();

  // Only the account-confirmation email has gone to her inbox so far.
  const baseline = await countEmails(ashaEmail);
  expect(baseline).toBe(1);

  await asha.goto(raviPath);
  await asha.getByRole("button", { name: "Connect" }).click();
  await expect(asha.getByText("Request sent")).toBeVisible();

  await ravi.goto("/connections?tab=incoming");
  await ravi.getByRole("button", { name: "Accept" }).click();
  await expect(ravi.getByText("No requests waiting for you.")).toBeVisible();

  // The in-app notification lands (proves the worker processed and committed the delivery, so the email
  // decision inside that same call has already been made). The worker fans out asynchronously, so retry
  // the navigation until the row shows up.
  await expect(async () => {
    await asha.goto("/notifications");
    await expect(asha.getByText("connection accepted")).toBeVisible({
      timeout: 2_000,
    });
  }).toPass({ timeout: 20_000 });

  // ...but no email.send job was ever queued for it: Mailpit's count for Asha stays at the baseline.
  expect(await countEmails(ashaEmail)).toBe(baseline);
});
