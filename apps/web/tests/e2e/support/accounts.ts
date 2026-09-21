import { expect, type Page } from "@playwright/test";

import { linkIn, waitForEmail } from "./mailpit";

export const PASSWORD = "correct-horse-battery";

export const unique = (domain: string) =>
  `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@${domain}`;

export async function register(page: Page, email: string) {
  await page.goto("/register");
  await page.getByLabel("Full name").fill("E2E Person");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/register\/check-email/);
}

export async function confirmEmail(page: Page, email: string) {
  const mail = await waitForEmail(email, { subject: /verify your email/i });
  await page.goto(linkIn(mail.text));
  await expect(page).toHaveURL(/\/verify-email\?status=confirmed/);
  await expect(
    page.getByText("Email confirmed", { exact: true })
  ).toBeVisible();
}

export async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}
