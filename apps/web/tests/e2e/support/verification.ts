import { expect, type Browser, type Page } from "@playwright/test";

import { signIn } from "./accounts";

const COORDINATOR_EMAIL = process.env.DEV_COORDINATOR_EMAIL;
const COORDINATOR_PASSWORD = process.env.DEV_COORDINATOR_PASSWORD;
const BASE_URL =
  process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000";

/** A distinct client address per test, so the per-IP submission limit never spans runs. */
export const clientIp = () =>
  `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

export const rollNumber = () =>
  `E2E-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

export async function submitEvidence(page: Page, roll: string) {
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel(/roll/i).fill(roll);
  await page.getByLabel("Department").selectOption({ index: 1 });
  await page.getByLabel("Degree").selectOption({ index: 1 });
  await page.getByLabel("Graduation year").selectOption("2019");
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText("Your request is in review")).toBeVisible();
}

/** A second, independent browser session for the reviewer. */
export async function coordinator(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { "x-forwarded-for": clientIp() },
  });
  const page = await context.newPage();
  await signIn(page, COORDINATOR_EMAIL!, COORDINATOR_PASSWORD!);
  await expect(page).toHaveURL(/\/$/);
  return page;
}

export async function decide(
  reviewer: Page,
  roll: string,
  decision: "Approve" | "Reject",
  note?: string
) {
  await reviewer.goto("/admin/verification");
  const row = reviewer.getByTestId(`request-${roll}`);
  await expect(row).toBeVisible();
  if (note) await row.getByLabel(/note/i).fill(note);
  await row.getByRole("button", { name: decision }).click();
  await expect(row).toBeHidden();
}
