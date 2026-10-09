import { expect, test, type Browser, type Page } from "./support/test";

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
  await expect(page).toHaveURL(/\/dashboard$/);
  return page;
}

test("J-05 a member adds, edits and removes experience, education, skills and links; visibility follows the section mapping", async ({
  browser,
}) => {
  const owner = await member(browser);
  const viewer = await member(browser);

  await owner.goto("/profile/details");

  await owner.getByLabel("Company").fill("Acme");
  await owner.getByLabel("Role").fill("Engineer");
  await owner.getByLabel("Start date").fill("2020-01-15");
  await owner.getByLabel("I currently work here").check();
  await owner
    .locator("#experience")
    .getByRole("button", { name: "Add" })
    .click();
  await expect(owner.getByText("Engineer · Acme")).toBeVisible();

  await owner.getByLabel("Institution").fill("IIT Madras");
  await owner.getByLabel("Qualification").fill("M.Tech");
  await owner.getByLabel("Start year").fill("2019");
  await owner.getByLabel("End year (leave empty if ongoing)").fill("2021");
  await owner
    .locator("#education")
    .getByRole("button", { name: "Add" })
    .click();
  await expect(owner.getByText("IIT Madras")).toBeVisible();

  await owner.getByLabel("Add a skill").fill("TypeScript");
  await owner.locator("#skills").getByRole("button", { name: "Add" }).click();
  await expect(owner.locator("#skills").getByText("TypeScript")).toBeVisible();

  await owner.getByLabel("Type").selectOption("GITHUB");
  await owner.getByLabel("URL").fill("https://github.com/asha");
  await owner.locator("#links").getByRole("button", { name: "Add" }).click();
  await expect(owner.getByText("https://github.com/asha")).toBeVisible();

  await owner
    .locator("#experience")
    .getByRole("link", { name: "Edit" })
    .click();
  await expect(owner).toHaveURL(/edit=experience:/);
  const editForm = owner.locator("#experience form", { hasText: "Save" });
  await editForm.getByLabel("Role").fill("Senior Engineer");
  await editForm.getByRole("button", { name: "Save" }).click();
  await expect(owner.getByText(/Senior Engineer/)).toBeVisible();

  await owner.goto("/profile");
  const memberUrl = await owner
    .getByRole("link", { name: "View my profile" })
    .getAttribute("href");
  await viewer.goto(memberUrl!);
  await expect(viewer.getByText("Experience")).toBeVisible();
  await expect(viewer.getByText(/Senior Engineer/)).toBeVisible();
  await expect(viewer.getByText("Education")).toBeVisible();
  await expect(viewer.getByText("Skills")).toBeVisible();
  await expect(
    viewer.getByRole("article").getByText("TypeScript")
  ).toBeVisible();
  await expect(viewer.getByText("Links")).toBeVisible();
  const link = viewer
    .getByRole("article")
    .getByRole("link", { name: /github\.com\/asha/ });
  await expect(link).toHaveAttribute("rel", /nofollow/);

  // Hide experience: skills disappear with it (same section), education and links remain.
  await owner.goto("/profile/privacy");
  await owner
    .getByLabel("Who can see your work experience and skills")
    .selectOption("Only me");
  await owner.getByRole("button", { name: "Save privacy settings" }).click();
  await expect(owner.getByText("Privacy settings saved.")).toBeVisible();

  await viewer.goto(memberUrl!);
  await expect(viewer.getByText("Experience")).toHaveCount(0);
  await expect(viewer.getByText("Skills")).toHaveCount(0);
  await expect(viewer.getByText("Education")).toBeVisible();
  await expect(viewer.getByText("Links")).toBeVisible();

  await owner.goto("/profile/details");
  await owner
    .locator("#skills")
    .getByRole("button", { name: "Remove" })
    .click();
  await expect(owner.locator("#skills").getByText("TypeScript")).toHaveCount(0);
});
