import { expect, test } from "@playwright/test";

import {
  confirmEmail,
  PASSWORD,
  register,
  signIn,
  unique,
} from "./support/accounts";
import { countEmails, linkIn, waitForEmail } from "./support/mailpit";

const NEW_PASSWORD = "a-brand-new-passphrase";
const INSTITUTIONAL_DOMAIN =
  process.env.E2E_INSTITUTIONAL_DOMAIN ?? "nitap.ac.in";

test.describe("identity flows", () => {
  test("an external address registers, confirms, signs in and lands on onboarding", async ({
    page,
  }) => {
    const email = unique("example.test");

    await register(page, email);
    await expect(page.getByText(email)).toBeVisible();
    await confirmEmail(page, email);
    await signIn(page, email);

    await expect(page).toHaveURL(/\/onboarding/);
    await expect(
      page.getByText("Verify your affiliation").first()
    ).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("an institutional address is verified automatically and lands on the home page", async ({
    page,
  }) => {
    const email = unique(INSTITUTIONAL_DOMAIN);

    await register(page, email);
    await confirmEmail(page, email);
    await signIn(page, email);

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page).not.toHaveURL(/account\/status/);
  });

  test("a forgotten password is reset through the emailed link, once", async ({
    page,
  }) => {
    const email = unique("example.test");
    await register(page, email);
    await confirmEmail(page, email);

    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText(/if an account exists/i)).toBeVisible();

    const mail = await waitForEmail(email, { subject: /reset your/i });
    const link = linkIn(mail.text);
    await page.goto(link);
    await expect(page).toHaveURL(/\/reset-password\?token=/);
    await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel("Confirm new password").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Set new password" }).click();
    await expect(page.getByText(/signed out on other devices/i)).toBeVisible();

    await signIn(page, email, PASSWORD);
    await expect(
      page.getByText("Email or password is incorrect.")
    ).toBeVisible();

    await signIn(page, email, NEW_PASSWORD);
    await expect(page).toHaveURL(/\/onboarding/);

    await page.goto(link);
    await expect(page.getByText("This link is not valid")).toBeVisible();
  });

  test("registering an address that already has an account looks identical and warns its owner", async ({
    page,
  }) => {
    const email = unique("example.test");
    await register(page, email);
    await waitForEmail(email, { subject: /verify your email/i });

    await register(page, email);
    await expect(page.getByText(email)).toBeVisible();

    const notice = await waitForEmail(email, {
      subject: /someone tried to register/i,
    });
    expect(notice.text).toMatch(/already exists/i);
    expect(await countEmails(email)).toBe(2);
  });

  test("a wrong password and an unknown address get the same message", async ({
    page,
  }) => {
    const email = unique("example.test");
    await register(page, email);
    await confirmEmail(page, email);

    // Each sign-in starts from a fresh /login, so the message on screen is that attempt's own.
    await signIn(page, email, "not-the-password");
    await expect(
      page.getByText("Email or password is incorrect.")
    ).toBeVisible();

    await signIn(page, unique("example.test"), "not-the-password");
    await expect(
      page.getByText("Email or password is incorrect.")
    ).toBeVisible();
  });

  test("a signed-out visitor to a gated page is sent to sign in and back", async ({
    page,
  }) => {
    await page.goto("/account/status");
    await expect(page).toHaveURL(/\/login\?next=%2Faccount%2Fstatus/);
  });
});
