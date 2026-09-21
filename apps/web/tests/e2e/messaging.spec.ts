import { expect, test, type Browser, type Page } from "@playwright/test";

import { confirmEmail, register, signIn, unique } from "./support/accounts";

const DOMAIN = process.env.E2E_INSTITUTIONAL_DOMAIN ?? "nitap.ac.in";
const BASE_URL =
  process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000";

const clientIp = () =>
  `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

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
  await expect(page).toHaveURL(/\/$/);
  return page;
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

test("J-10 members message each other, see unread counts, report and block", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const asha = await member(browser);
  const ravi = await member(browser);
  const outsider = await member(browser);
  await setLevel(ravi, "Verified members");
  await setLevel(asha, "Verified members");
  const raviPath = await profilePath(ravi);

  // Asha opens Ravi's profile and starts a conversation.
  await asha.goto(raviPath);
  await asha.getByRole("button", { name: "Message" }).click();
  await expect(asha).toHaveURL(/\/messages\/[0-9a-f-]{36}$/);
  const threadUrl = asha.url();
  await asha
    .getByRole("textbox", { name: "Message" })
    .fill("Hello Ravi, nice to meet you");
  await asha.getByRole("button", { name: "Send" }).click();
  await expect(asha.getByText("Hello Ravi, nice to meet you")).toBeVisible();

  // Ravi sees it unread in his inbox, opens it, and the badge clears.
  await expect(async () => {
    await ravi.goto("/messages");
    await expect(ravi.getByLabel("1 unread")).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await ravi.locator('main a[href^="/messages/"]').first().click();
  await expect(ravi.getByText("Hello Ravi, nice to meet you")).toBeVisible();
  await ravi.goto("/messages");
  await expect(ravi.getByLabel("1 unread")).toHaveCount(0);

  // Ravi replies while Asha has the thread open: it arrives without a reload (SSE, or the 30 s backfill).
  await ravi.goto(threadUrl);
  await ravi
    .getByRole("textbox", { name: "Message" })
    .fill("Nice to meet you too");
  await ravi.getByRole("button", { name: "Send" }).click();
  await expect(asha.getByText("Nice to meet you too")).toBeVisible({
    timeout: 40_000,
  });

  // Ravi reports Asha's first message.
  await ravi
    .getByRole("button", { name: /Report message from/ })
    .first()
    .click();
  await ravi.getByLabel("Reason").fill("Testing the report flow");
  await ravi.getByRole("button", { name: "Submit report" }).click();
  await expect(ravi.getByText("Report sent.")).toBeVisible();

  // Someone outside the conversation gets the not-found page.
  await outsider.goto(threadUrl);
  await expect(outsider.getByText("Page Not Found (404)")).toBeVisible();

  // Asha blocks Ravi: she is told to unblock, he no longer sees the thread.
  await asha.goto(raviPath);
  await asha.getByRole("button", { name: "Block" }).click();
  await asha.getByRole("button", { name: "Confirm block" }).click();
  await asha.goto(threadUrl);
  await asha
    .getByRole("textbox", { name: "Message" })
    .fill("This should not send");
  await asha.getByRole("button", { name: "Send" }).click();
  await expect(asha.getByText("You have blocked this member")).toBeVisible();
  await ravi.goto(threadUrl);
  await expect(ravi.getByText("Page Not Found (404)")).toBeVisible();
});
