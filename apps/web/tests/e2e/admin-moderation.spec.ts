import { expect, test, type Browser, type Page } from "@playwright/test";

import { Pool } from "pg";

import { confirmEmail, register, signIn, unique } from "./support/accounts";

type RoleName = "ALUMNI" | "TP_ADMIN" | "INSTITUTE_ADMIN" | "MODERATOR";

const DOMAIN = process.env.E2E_INSTITUTIONAL_DOMAIN ?? "nitap.ac.in";
const BASE_URL =
  process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000";
const clientIp = () =>
  `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

async function member(
  browser: Browser
): Promise<{ page: Page; email: string }> {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { "x-forwarded-for": clientIp() },
  });
  const page = await context.newPage();
  const email = unique(DOMAIN);
  await register(page, email);
  await confirmEmail(page, email);
  await signIn(page, email);
  await expect(page).toHaveURL(/\/$/);
  return { page, email };
}

/** Direct DB access, so this suite needs no pre-seeded admin (same approach as jobs.spec.ts). */
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function grantRole(email: string, roleName: RoleName): Promise<void> {
  const { rows } = await pool.query<{ id: string }>(
    'select id from "user" where email = $1',
    [email]
  );
  const id = rows[0]?.id;
  if (!id) throw new Error(`No user seeded for ${email}`);
  await pool.query(
    `insert into user_role (user_id, role_id, granted_by)
     select $1, role.id, $1 from role where role.name = $2
     on conflict (user_id, role_id) do nothing`,
    [id, roleName]
  );
}

test.afterAll(async () => {
  await pool.end();
});

const idOf = async (email: string) =>
  (
    await pool.query<{ id: string }>('select id from "user" where email = $1', [
      email,
    ])
  ).rows[0]!.id;

/** A direct conversation with messages, straight in the database (the journey under test is moderation). */
async function conversationWith(
  senderEmail: string,
  readerEmail: string,
  bodies: string[]
) {
  const [sender, reader] = [await idOf(senderEmail), await idOf(readerEmail)];
  const [lo, hi] = [sender, reader].map((id) => id.toLowerCase()).sort();
  const { rows } = await pool.query<{ id: string }>(
    `insert into conversation (created_by_id, is_group, direct_pair_key) values ($1, false, $2) returning id`,
    [sender, `${lo}:${hi}`]
  );
  const conversationId = rows[0]!.id;
  await pool.query(
    `insert into conversation_participant (conversation_id, user_id) values ($1, $2), ($1, $3)`,
    [conversationId, sender, reader]
  );
  for (const body of bodies)
    await pool.query(
      `insert into message (conversation_id, sender_id, body, client_message_id) values ($1, $2, $3, gen_random_uuid())`,
      [conversationId, sender, body]
    );
  await pool.query(
    `update conversation c set last_message_seq = (select max(seq) from message m where m.conversation_id = c.id),
       last_message_at = now() where c.id = $1`,
    [conversationId]
  );
  return conversationId;
}

test("a member reports a message; a Moderator reads the context, resolves it, and the reporter sees the tombstone", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const sender = await member(browser);
  const reporter = await member(browser);
  const moderator = await member(browser);
  await grantRole(moderator.email, "MODERATOR");
  const offending = `offending ${Date.now()}`;
  const conversationId = await conversationWith(sender.email, reporter.email, [
    "hello",
    offending,
    "bye",
  ]);

  await reporter.page.goto(`/messages/${conversationId}`);
  await reporter.page
    .getByRole("listitem")
    .filter({ hasText: offending })
    .getByRole("button", { name: /Report message from/ })
    .click();
  await reporter.page.getByLabel("Reason").fill("Abusive");
  await reporter.page.getByRole("button", { name: "Submit report" }).click();
  await expect(reporter.page.getByText("Report sent.")).toBeVisible();

  await moderator.page.goto("/admin/reports?targetType=MESSAGE");
  await expect(moderator.page.getByText(offending)).toHaveCount(0); // never in the list
  await moderator.page
    .getByRole("row")
    .filter({ hasText: "Abusive" })
    .getByRole("link", { name: /view/i })
    .click();
  await expect(
    moderator.page.getByRole("heading", { name: "Conversation context" })
  ).toBeVisible();
  await expect(moderator.page.getByText(offending)).toBeVisible();

  await moderator.page
    .getByRole("button", { name: "Resolve", exact: true })
    .click();
  await moderator.page.getByLabel("Reason").selectOption("HARASSMENT");
  await moderator.page.getByRole("button", { name: "Resolve report" }).click();
  // Scoped to the <h1> status badge: unscoped getByText("Resolved") also matches the flattened
  // "ClaimResolveDismiss" button-group text (the "e" of Resolve + "D" of Dismiss), which is present
  // immediately on load and produces a false positive that races the resolve transaction.
  await expect(
    moderator.page.locator("h1").getByText("Resolved", { exact: true })
  ).toBeVisible({
    timeout: 15_000,
  });

  const { rows } = await pool.query<{ n: number }>(
    `select count(*)::int as n from audit_log where action = 'message.read_reported' and actor_id = $1`,
    [await idOf(moderator.email)]
  );
  expect(rows[0]!.n).toBeGreaterThanOrEqual(1);

  await reporter.page.goto(`/messages/${conversationId}`);
  await expect(
    reporter.page.getByText("This message was removed by a moderator.")
  ).toBeVisible();
  await expect(
    reporter.page.getByRole("list", { name: "Messages" }).getByText(offending)
  ).toHaveCount(0);
});

test("/jobs/moderation redirects to /admin/jobs", async ({ browser }) => {
  const approver = await member(browser);
  await grantRole(approver.email, "TP_ADMIN");
  await approver.page.goto("/jobs/moderation");
  await expect(approver.page).toHaveURL(/\/admin\/jobs$/);
  await expect(
    approver.page.getByRole("heading", { name: "Job moderation queue" })
  ).toBeVisible();
});
