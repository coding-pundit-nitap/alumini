import { expect, test, type Browser, type Page } from "./support/test";

import { confirmEmail, register, signIn, unique } from "./support/accounts";

const DOMAIN = process.env.E2E_INSTITUTIONAL_DOMAIN ?? "nitap.ac.in";
const BASE_URL =
  process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000";

const clientIp = () =>
  `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

/**
 * Uncaught page errors per member, mainly hydration mismatches, which drop
 * clicks and cause flicker.
 */
const pageErrors = new WeakMap<Page, string[]>();
const hydrationErrors = (page: Page) =>
  (pageErrors.get(page) ?? []).filter((m) => m.includes("Hydration failed"));

async function member(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { "x-forwarded-for": clientIp() },
  });
  const page = await context.newPage();
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
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

/**
 * Excludes the draft box: React mirrors a textarea's value into its text, so
 * getByText matches typed text.
 */
const posted = (page: Page, body: string) =>
  page.getByRole("log", { name: "Messages" }).getByText(body);

/**
 * Wait until the "Sending" marker clears, or another member's page may load
 * without the message.
 */
async function expectSent(page: Page, body: string) {
  await expect(posted(page, body)).toBeVisible({ timeout: 15_000 });
  await expect(
    page
      .getByRole("log", { name: "Messages" })
      .getByText("Sending", { exact: true })
  ).toHaveCount(0, { timeout: 15_000 });
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

  await asha.goto(raviPath);
  await asha.getByRole("button", { name: "Message" }).click();
  await expect(asha).toHaveURL(/\/messages\/[0-9a-f-]{36}$/);
  const threadUrl = asha.url();
  await asha
    .getByRole("textbox", { name: "Message" })
    .fill("Hello Ravi, nice to meet you");
  await asha.getByRole("button", { name: "Send" }).click();
  await expectSent(asha, "Hello Ravi, nice to meet you");

  await ravi.goto("/messages");
  await expect(ravi.getByLabel("1 unread")).toBeVisible({ timeout: 15_000 });
  await ravi
    .locator('main a[href^="/messages/"]:not([href="/messages/new-group"])')
    .first()
    .click();
  await expect(posted(ravi, "Hello Ravi, nice to meet you")).toBeVisible({
    timeout: 15_000,
  });
  await expect(async () => {
    await ravi.goto("/messages"); // the read marker posts asynchronously
    await expect(ravi.getByLabel("1 unread")).toHaveCount(0, { timeout: 2000 });
  }).toPass({ timeout: 20_000 });

  // Ravi replies while Asha has the thread open: it arrives without a reload (SSE, or the 30 s backfill).
  await ravi.goto(threadUrl);
  await ravi
    .getByRole("textbox", { name: "Message" })
    .fill("Nice to meet you too");
  await ravi.getByRole("button", { name: "Send" }).click();
  await expect(posted(asha, "Nice to meet you too")).toBeVisible({
    timeout: 40_000,
  });

  await ravi
    .getByRole("button", { name: /Report message from/ })
    .first()
    .click();
  await ravi.getByLabel("Reason").fill("Testing the report flow");
  await ravi.getByRole("button", { name: "Submit report" }).click();
  await expect(ravi.getByText("Report sent.")).toBeVisible();

  await outsider.goto(threadUrl);
  await expect(outsider.getByText("Page not found")).toBeVisible();

  await asha.goto(raviPath);
  await asha.getByRole("button", { name: "Block" }).click();
  await asha.getByRole("button", { name: "Confirm block" }).click();
  // The block is a Server Action: wait for its refresh to land, or the send below outruns it. Blocking
  // hides the pair both ways, so the blocker's own view of the profile turns into the not-found page.
  await expect(asha.getByText("Page not found")).toBeVisible({
    timeout: 15_000,
  });
  await asha.goto(threadUrl);
  await asha
    .getByRole("textbox", { name: "Message" })
    .fill("This should not send");
  await asha.getByRole("button", { name: "Send" }).click();
  await expect(asha.getByText("You have blocked this member")).toBeVisible();
  await ravi.goto(threadUrl);
  await expect(ravi.getByText("Page not found")).toBeVisible();

  for (const page of [asha, ravi]) expect(hydrationErrors(page)).toEqual([]);
});

test("J-11 a member starts a group from their connections and manages it", async ({
  browser,
}) => {
  const asha = await member(browser);
  const ravi = await member(browser);
  const meera = await member(browser);
  for (const m of [asha, ravi, meera]) await setLevel(m, "Verified members");
  const [raviPath, meeraPath] = [
    await profilePath(ravi),
    await profilePath(meera),
  ];
  for (const [other, path] of [
    [ravi, raviPath],
    [meera, meeraPath],
  ] as const) {
    await asha.goto(path);
    await asha.getByRole("button", { name: "Connect" }).click();
    await expect(asha.getByText("Request sent")).toBeVisible();
    await other.goto("/connections?tab=incoming");
    await other.getByRole("button", { name: "Accept" }).click();
    await expect(other.getByRole("button", { name: "Accept" })).toHaveCount(0);
  }

  await asha.goto("/messages/new-group");
  await asha.getByLabel("Group name (optional)").fill("Batch reunion");
  // The checkboxes are visually hidden; a person clicks the row, which is their label.
  const picks = asha
    .locator("label")
    .filter({ has: asha.getByRole("checkbox") });
  await picks.nth(0).click();
  await picks.nth(1).click();
  await expect(asha.getByRole("checkbox", { checked: true })).toHaveCount(2);
  await asha.getByRole("button", { name: "Create group" }).click();
  await expect(asha).toHaveURL(/\/messages\/[0-9a-f-]{36}$/);
  await expect(
    asha.getByRole("heading", { name: "Batch reunion" })
  ).toBeVisible();
  const groupUrl = asha.url();
  await asha
    .getByRole("textbox", { name: "Message" })
    .fill("Welcome to the group");
  // Send stays disabled on an empty draft; it enables once the hydrated composer holds the text.
  const send = asha.getByRole("button", { name: "Send" });
  await expect(send).toBeEnabled();
  await send.click();
  await expectSent(asha, "Welcome to the group");

  await ravi.goto(groupUrl);
  await expect(posted(ravi, "Welcome to the group")).toBeVisible({
    timeout: 15_000,
  });
  await ravi.getByRole("button", { name: "Members" }).click();
  await expect(ravi.getByRole("button", { name: "Leave group" })).toBeVisible();
  await expect(ravi.getByLabel("Add member")).toHaveCount(0);

  await ravi.getByRole("button", { name: "Leave group" }).click();
  await expect(ravi).toHaveURL(/\/messages$/);
  await ravi.goto(groupUrl);
  await expect(ravi.getByText("Page not found")).toBeVisible();
  await asha.reload();
  await asha.getByRole("button", { name: "Members" }).click();
  await expect(asha.getByLabel("Add member")).toBeVisible();
  await expect(asha.getByRole("button", { name: "Leave group" })).toHaveCount(
    0
  );

  for (const page of [asha, ravi]) expect(hydrationErrors(page)).toEqual([]);
});
