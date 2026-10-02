import { execFileSync } from "node:child_process";
import path from "node:path";

import { expect, test, type Browser, type Page } from "./support/test";

import { confirmEmail, register, signIn, unique } from "./support/accounts";
import { clientIp, coordinator } from "./support/verification";

// The student path uses the institutional domain: the seeded policy maps nitap.ac.in to STUDENT
// with auto-verify, and STUDENT holds `event.register` (the member baseline).
const DOMAIN = process.env.E2E_INSTITUTIONAL_DOMAIN ?? "nitap.ac.in";
const BASE_URL =
  process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000";

const DAY = 24 * 60 * 60 * 1000;

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
  await expect(page).toHaveURL(/\/dashboard$/);
  return page;
}

/** `<input type="datetime-local">` wants the machine's own local wall time, matching the browser's
 * default time zone (`EventForm` reads `Intl.DateTimeFormat().resolvedOptions().timeZone` on mount,
 * same machine). */
function localDateTime(msFromNow: number): string {
  const d = new Date(Date.now() + msFromNow);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Fills and submits `/events/new`, returning the created event's id from the post-submit redirect. */
async function createEventViaUi(
  organizer: Page,
  opts: {
    title: string;
    capacity: number;
    startsInMs: number;
    deadlineInMs: number;
  }
): Promise<string> {
  await organizer.goto("/events/new");
  // The timezone Select is set by a client effect after mount; wait for it before submitting.
  await expect(organizer.locator("#event-timezone")).not.toHaveText("");
  await organizer.getByLabel("Title").fill(opts.title);
  await organizer
    .getByLabel("Description")
    .fill("An event created for an end-to-end test.");
  await organizer.getByLabel("Starts").fill(localDateTime(opts.startsInMs));
  await organizer
    .getByLabel("Registration closes")
    .fill(localDateTime(opts.deadlineInMs));
  await organizer.getByLabel("Location").fill("Campus Hall");
  await organizer.getByLabel("Capacity").fill(String(opts.capacity));
  await organizer.getByRole("button", { name: "Create event" }).click();
  await expect(organizer).toHaveURL(/\/events\/[0-9a-f-]{36}$/);
  return organizer.url().split("/").pop()!;
}

test.describe("events", () => {
  test("J-08 create an event, fill its one seat, cancel and reopen it", async ({
    browser,
  }) => {
    test.setTimeout(90_000); // an event create, two sign-ups and several page loads
    const organizer = await coordinator(browser);
    const token = `evt${Date.now().toString(36)}`;
    const title = `Alumni mixer ${token}`;

    const eventId = await createEventViaUi(organizer, {
      title,
      capacity: 1,
      startsInMs: 2 * DAY,
      deadlineInMs: 1 * DAY,
    });

    // Browse: the new event is visible on /events (Upcoming, the default tab) and its own page.
    await organizer.goto("/events");
    await expect(organizer.getByRole("link", { name: title })).toBeVisible();
    await organizer.goto(`/events/${eventId}`);
    await expect(organizer.getByRole("heading", { name: title })).toBeVisible();

    const memberA = await student(browser);
    const memberB = await student(browser);

    // A registers and takes the only seat.
    await memberA.goto(`/events/${eventId}`);
    await memberA.getByRole("button", { name: "Register" }).click();
    await expect(
      memberA.getByRole("button", { name: "Cancel registration" })
    ).toBeVisible();
    await expect(memberA.getByText("0 of 1 spots left")).toBeVisible();
    await expect(memberA.getByText("Full", { exact: true })).toBeVisible();

    // B sees it full and cannot register.
    await memberB.goto(`/events/${eventId}`);
    await expect(memberB.getByText("Full", { exact: true })).toBeVisible();
    const registerB = memberB.getByRole("button", { name: "Register" });
    await expect(registerB).toBeDisabled();
    await expect(memberB.getByText("This event is full.")).toBeVisible();

    // A cancels, freeing the seat for B.
    await memberA.getByRole("button", { name: "Cancel registration" }).click();
    await memberA
      .getByRole("alertdialog")
      .getByRole("button", { name: "Cancel registration" })
      .click();
    await expect(
      memberA.getByRole("button", { name: "Register" })
    ).toBeVisible();
    await expect(memberA.getByText("1 of 1 spots left")).toBeVisible();

    await memberB.goto(`/events/${eventId}`);
    await memberB.getByRole("button", { name: "Register" }).click();
    await expect(
      memberB.getByRole("button", { name: "Cancel registration" })
    ).toBeVisible();
    await expect(memberB.getByText("0 of 1 spots left")).toBeVisible();
  });

  test("J-09 an organizer cancels an event and a registrant can no longer act on it", async ({
    browser,
  }) => {
    test.setTimeout(60_000);
    const organizer = await coordinator(browser);
    const token = `evt${Date.now().toString(36)}`;
    const title = `Chapter reunion ${token}`;

    const eventId = await createEventViaUi(organizer, {
      title,
      capacity: 10,
      startsInMs: 2 * DAY,
      deadlineInMs: 1 * DAY,
    });

    const member = await student(browser);
    await member.goto(`/events/${eventId}`);
    await member.getByRole("button", { name: "Register" }).click();
    await expect(
      member.getByRole("button", { name: "Cancel registration" })
    ).toBeVisible();

    // The organizer cancels the whole event behind the AlertDialog.
    await organizer.goto(`/events/${eventId}`);
    await organizer.getByRole("button", { name: "Cancel event" }).click();
    await organizer
      .getByRole("alertdialog")
      .getByRole("button", { name: "Cancel event" })
      .click();
    await expect(
      organizer.getByText("Cancelled", { exact: true })
    ).toBeVisible();

    // A fresh load, rather than asserting into the still-open AlertDialog (whose own confirm button
    // shares the trigger's accessible name and isn't itself disabled).
    await organizer.goto(`/events/${eventId}`);
    await expect(
      organizer.getByRole("button", { name: "Cancel event" })
    ).toBeDisabled();

    // The registrant sees it cancelled and can no longer act on their registration.
    await member.goto(`/events/${eventId}`);
    await expect(member.getByText("Cancelled", { exact: true })).toBeVisible();
    await expect(
      member.getByRole("button", { name: "Cancel registration" })
    ).toBeDisabled();
    await expect(member.getByText("This event was cancelled.")).toBeVisible();
  });

  test("J-10 an organizer marks a past event's registrant as attended", async ({
    browser,
  }) => {
    test.setTimeout(60_000);

    // Seeded by a standalone Node script, not imported here: the generated Prisma client uses
    // `import.meta`, which Playwright's CJS test transform cannot load (Next.js and plain Node, both
    // ESM, handle it fine — see support/seed-past-event.ts).
    const { eventId, registrantName } = JSON.parse(
      execFileSync(
        "node",
        [path.join(__dirname, "support/seed-past-event.ts")],
        { encoding: "utf8", cwd: path.join(__dirname, "../..") }
      )
    ) as { eventId: string; registrantName: string };

    const organizer = await coordinator(browser);
    await organizer.goto(`/events/${eventId}`);
    const row = organizer.getByRole("row", {
      name: new RegExp(registrantName),
    });
    await expect(row).toBeVisible();
    await expect(row.getByText("REGISTERED", { exact: true })).toBeVisible();

    await row
      .getByRole("combobox", {
        name: `Mark attendance for ${registrantName}`,
      })
      .click();
    await organizer.getByRole("option", { name: "Attended" }).click();

    await expect(row.getByText("ATTENDED", { exact: true })).toBeVisible();
  });
});
