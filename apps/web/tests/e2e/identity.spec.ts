import { expect, test, type Page } from "@playwright/test";

import { countEmails, linkIn, waitForEmail } from "./support/mailpit";

const PASSWORD = "correct-horse-battery";
const NEW_PASSWORD = "a-brand-new-passphrase";
const INSTITUTIONAL_DOMAIN =
  process.env.E2E_INSTITUTIONAL_DOMAIN ?? "nitap.ac.in";

const unique = (domain: string) =>
  `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@${domain}`;

async function register(page: Page, email: string) {
  await page.goto("/register");
  await page.getByLabel("Full name").fill("E2E Person");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/register\/check-email/);
}

async function confirmEmail(page: Page, email: string) {
  const mail = await waitForEmail(email, { subject: /verify your email/i });
  await page.goto(linkIn(mail.text));
  await expect(page).toHaveURL(/\/verify-email\?status=confirmed/);
  await expect(
    page.getByText("Email confirmed", { exact: true })
  ).toBeVisible();
}

async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.describe("identity flows", () => {
  test("an external address registers, confirms, signs in and waits on the status page", async ({
    page,
  }) => {
    const email = unique("example.test");

    await register(page, email);
    await expect(page.getByText(email)).toBeVisible();
    await confirmEmail(page, email);
    await signIn(page, email);

    await expect(page).toHaveURL(/\/account\/status/);
    await expect(
      page.getByText("Your account is awaiting verification")
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

    await expect(page).toHaveURL(/\/$/);
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
    await expect(page).toHaveURL(/\/account\/status/);

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
