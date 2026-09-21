import { expect, test, type Browser, type Page } from "@playwright/test";

import { confirmEmail, register, signIn, unique } from "./support/accounts";
import {
  clientIp,
  coordinator,
  decide,
  rollNumber,
  submitEvidence,
} from "./support/verification";

// The student path uses the institutional domain: the seeded policy (INSTITUTIONAL_EMAIL_POLICY) maps
// nitap.ac.in to STUDENT with auto-verify, and STUDENT holds `mentorship.request`.
const DOMAIN = process.env.E2E_INSTITUTIONAL_DOMAIN ?? "nitap.ac.in";
const BASE_URL =
  process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000";

async function context(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { "x-forwarded-for": clientIp() },
  });
  return ctx.newPage();
}

async function student(browser: Browser): Promise<Page> {
  const page = await context(browser);
  const email = unique(DOMAIN);
  await register(page, email);
  await confirmEmail(page, email);
  await signIn(page, email);
  await expect(page).toHaveURL(/\/$/);
  return page;
}

/** An alumnus: evidence submitted, approved by the coordinator, signed in. */
async function alumnus(browser: Browser, reviewer: Page): Promise<Page> {
  const page = await context(browser);
  const email = unique("example.test");
  await register(page, email);
  await confirmEmail(page, email);
  await signIn(page, email);
  const roll = rollNumber();
  await submitEvidence(page, roll);
  await decide(reviewer, roll, "Approve");
  await page.goto("/mentorship");
  return page;
}

const row = (page: Page, text: string) =>
  page.getByRole("listitem").filter({ hasText: text });

test("J-07 a student asks an alumnus to mentor them; the alumnus accepts, starts and completes", async ({
  browser,
}) => {
  const reviewer = await coordinator(browser);
  const mentor = await alumnus(browser, reviewer);
  const first = await student(browser);
  const second = await student(browser);

  const token = `sql${Date.now().toString(36)}`;
  const find = `/mentorship?tab=find&topic=${token}`;

  // The alumnus opts in with a single slot.
  await mentor.goto("/mentorship?tab=settings");
  await mentor.getByLabel("Expertise").fill(`Databases ${token}`);
  await mentor.getByLabel("Topics").fill(`${token}, careers`);
  await mentor.getByLabel("Availability").fill("Weekends");
  await mentor.getByLabel("Maximum mentees").fill("1");
  await mentor.getByRole("button", { name: "Save" }).click();
  await expect(mentor.getByText("Saved.")).toBeVisible();

  // Both students find the mentor (one spot left) and ask.
  const ask = async (page: Page, message: string) => {
    await page.goto(find);
    const card = row(page, `Databases ${token}`);
    await expect(card.getByText("1 spot left")).toBeVisible();
    await card.getByRole("button", { name: "Request mentorship" }).click();
    await page.getByLabel("Message").fill(message);
    await page.getByRole("button", { name: "Send request" }).click();
    await page.goto("/mentorship?tab=my-requests");
    await expect(row(page, message).getByText("Requested")).toBeVisible();
  };
  const firstMessage = `Could you mentor me on databases? ${token}`;
  const secondMessage = `Please consider me too ${token}`;
  await ask(first, firstMessage);
  await ask(second, secondMessage);

  // The alumnus sees both, accepts one and declines the other with a note.
  await mentor.goto("/mentorship?tab=requests");
  await row(mentor, firstMessage)
    .getByRole("button", { name: "Accept" })
    .click();
  await expect(row(mentor, firstMessage)).toBeHidden();
  await row(mentor, secondMessage)
    .getByRole("button", { name: "Decline" })
    .click();
  await row(mentor, secondMessage).getByLabel(/note/i).fill("Not this term.");
  await row(mentor, secondMessage)
    .getByRole("button", { name: "Send decline" })
    .click();
  await expect(row(mentor, secondMessage)).toBeHidden();

  await first.goto("/mentorship?tab=my-requests");
  await expect(row(first, firstMessage).getByText("Accepted")).toBeVisible();
  await second.goto("/mentorship?tab=my-requests");
  await expect(row(second, secondMessage).getByText("Declined")).toBeVisible();
  await expect(second.getByText("Not this term.")).toBeVisible();

  // The only slot is taken: the mentor drops out of discovery.
  await second.goto(find);
  await expect(second.getByText("No mentors match yet.")).toBeVisible();

  // Start, then complete.
  await mentor.goto("/mentorship?tab=mentees");
  await row(mentor, firstMessage)
    .getByRole("button", { name: "Mark as started" })
    .click();
  await expect(row(mentor, firstMessage).getByText("Active")).toBeVisible();
  await row(mentor, firstMessage)
    .getByRole("button", { name: "Mark completed" })
    .click();
  await expect(row(mentor, firstMessage)).toBeHidden(); // COMPLETED leaves the "mentees" tab

  await first.goto("/mentorship?tab=my-requests");
  await expect(row(first, firstMessage).getByText("Completed")).toBeVisible();

  // The slot is free again, so the mentor is listed again.
  await second.goto(find);
  await expect(
    row(second, `Databases ${token}`).getByText("1 spot left")
  ).toBeVisible();
});
