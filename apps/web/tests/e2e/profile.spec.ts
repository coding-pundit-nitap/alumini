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

test("J-04 a member edits their profile and controls who sees it", async ({
  browser,
}) => {
  const owner = await member(browser);
  const viewer = await member(browser);

  // Edit own profile.
  await owner.goto("/profile");
  await owner.getByLabel("Headline").fill("Robotics engineer");
  await owner.getByLabel("About you").fill("I build robots.");
  await owner.getByRole("button", { name: "Save profile" }).click();
  await expect(owner.getByText("Profile saved.")).toBeVisible();
  const memberUrl = await owner
    .getByRole("link", { name: "View my profile" })
    .getAttribute("href");
  expect(memberUrl).toMatch(/^\/members\/[0-9a-f-]{36}$/);

  // Default level: another verified member sees the full profile.
  await viewer.goto(memberUrl!);
  await expect(viewer.getByText("Robotics engineer")).toBeVisible();
  await expect(viewer.getByText("I build robots.")).toBeVisible();

  // PRIVATE: the same member now gets the not-found page (never a "forbidden").
  await setLevel(owner, "Only me");
  await viewer.goto(memberUrl!);
  await expect(viewer.getByText("Page not found")).toBeVisible();

  // The owner still sees their own profile.
  await owner.goto(memberUrl!);
  // Scoped to main: the account menu shows the owner's headline too.
  await expect(
    owner.getByRole("main").getByText("Robotics engineer")
  ).toBeVisible();

  // PUBLIC: a guest sees only the reduced view.
  await setLevel(owner, "Everyone, including people who are not signed in");
  const guestContext = await browser.newContext({ baseURL: BASE_URL });
  const guest = await guestContext.newPage();
  await guest.goto(memberUrl!);
  await expect(guest.getByText("Robotics engineer")).toBeVisible();
  await expect(guest.getByText("I build robots.")).toHaveCount(0);
  // Scoped to main: the signed-out header has its own "About" link.
  await expect(
    guest.getByRole("main").getByText("About", { exact: true })
  ).toHaveCount(0);
});

test("a forged institutional field in the profile form changes nothing", async ({
  browser,
}) => {
  const owner = await member(browser);
  await owner.goto("/profile");
  // Inject fields a hostile client could send; the action reads only the four named fields.
  await owner.evaluate(() => {
    const form = document.querySelector("form")!;
    for (const [name, value] of [
      ["graduationYear", "1999"],
      ["userId", "00000000-0000-4000-8000-000000000000"],
    ] as const) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }
  });
  await owner.getByLabel("Headline").fill("Still me");
  await owner.getByRole("button", { name: "Save profile" }).click();
  await expect(owner.getByText("Profile saved.")).toBeVisible();

  // The edit applied, and the forged year never reached the profile: no batch is shown for this member.
  await owner.reload();
  await expect(owner.getByLabel("Headline")).toHaveValue("Still me");
  await owner.getByRole("link", { name: "View my profile" }).click();
  await expect(owner.getByRole("main").getByText("Still me")).toBeVisible();
  await expect(owner.getByText(/Batch of/)).toHaveCount(0);
});
