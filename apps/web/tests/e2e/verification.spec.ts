import { expect, test, type Page } from "./support/test";

import { confirmEmail, register, signIn, unique } from "./support/accounts";
import { waitForEmail } from "./support/mailpit";
import {
  clientIp,
  coordinator,
  decide,
  rollNumber,
  submitEvidence,
} from "./support/verification";

const COORDINATOR_EMAIL = process.env.DEV_COORDINATOR_EMAIL;
const COORDINATOR_PASSWORD = process.env.DEV_COORDINATOR_PASSWORD;
const STAFF_DOMAIN = process.env.E2E_STAFF_DOMAIN ?? "staff.nitap.ac.in";
const BASE_URL =
  process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000";

test.beforeAll(() => {
  // Fail loudly rather than skip: a silently skipped journey is a journey nobody notices missing.
  if (!COORDINATOR_EMAIL || !COORDINATOR_PASSWORD) {
    throw new Error(
      "DEV_COORDINATOR_EMAIL and DEV_COORDINATOR_PASSWORD must be set (source .env) and seeded with `pnpm db:seed`."
    );
  }
});

async function newApplicant(page: Page, domain = "example.test") {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": clientIp() });
  const email = unique(domain);
  await register(page, email);
  await confirmEmail(page, email);
  await signIn(page, email);
  return email;
}

test.describe("alumni verification", () => {
  test("a submitted request is approved by a coordinator and the applicant becomes verified", async ({
    page,
    browser,
  }) => {
    const email = await newApplicant(page);
    const roll = rollNumber();
    await submitEvidence(page, roll);

    const reviewer = await coordinator(browser);
    await decide(reviewer, roll, "Approve");

    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/dashboard$/); // verified accounts are sent home
    const mail = await waitForEmail(email, { subject: /account is verified/i });
    expect(mail.text).not.toMatch(/https?:\/\//);
  });

  test("a rejection shows the reviewer's note and the applicant can submit again", async ({
    page,
    browser,
  }) => {
    const email = await newApplicant(page);
    const roll = rollNumber();
    await submitEvidence(page, roll);

    const reviewer = await coordinator(browser);
    await decide(reviewer, roll, "Reject", "Roll number not found.");

    await page.goto("/onboarding");
    await expect(page.getByText("Your request was not approved")).toBeVisible();
    await expect(page.getByText("Roll number not found.")).toBeVisible();
    await waitForEmail(email, {
      subject: /update on your nitap alumni network verification/i,
    });

    await submitEvidence(page, rollNumber());
  });

  test("three rejections lock the account: contact the alumni office, no form", async ({
    page,
    browser,
  }) => {
    await newApplicant(page);
    const reviewer = await coordinator(browser);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const roll = rollNumber();
      await page.goto("/onboarding");
      await submitEvidence(page, roll);
      await decide(
        reviewer,
        roll,
        "Reject",
        `Attempt ${attempt + 1} not found.`
      );
    }

    await page.goto("/onboarding");
    await expect(
      page.getByText("Please contact the alumni office")
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Submit for review" })
    ).toHaveCount(0);
  });

  test("a staff-domain account waits for the institute and gets no evidence form", async ({
    page,
  }) => {
    await newApplicant(page, STAFF_DOMAIN);

    await expect(page).toHaveURL(/\/onboarding/);
    await expect(
      page.getByText("Awaiting confirmation by the institute")
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Submit for review" })
    ).toHaveCount(0);
  });

  test("the review queue does not exist for an applicant, and needs a session", async ({
    page,
    browser,
  }) => {
    await newApplicant(page);
    // Wait for sign-in to finish: navigating away mid-sign-in would leave no session and land on /login.
    await expect(page).toHaveURL(/\/onboarding/);

    // The status is 200 because loading.tsx streams the response before notFound() throws.
    await page.goto("/admin/verification");
    await expect(page.getByText("Page not found")).toBeVisible();
    await expect(page.getByText("Verification requests")).toHaveCount(0);

    const anonymous = await browser.newContext({ baseURL: BASE_URL });
    const visitor = await anonymous.newPage();
    await visitor.goto("/admin/verification");
    await expect(visitor).toHaveURL(/\/login\?next=%2Fadmin%2Fverification/);
  });
});
