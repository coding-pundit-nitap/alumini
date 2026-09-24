import { expect, test, type Browser, type Page } from "@playwright/test";

import { Pool } from "pg";

import { confirmEmail, register, signIn, unique } from "./support/accounts";

/**
 * `RoleName` (`@nitap/database/role-permissions`) is a plain string-literal union, not something worth
 * re-declaring — but importing anything from `@nitap/database` itself pulls in the generated Prisma
 * client, which fails to load under Playwright's test transform (`import.meta` / ESM error, unrelated to
 * this task). A raw `pg` pool sidesteps that: it's already a dependency here, and the handful of queries
 * below don't need Prisma's type layer.
 */
type RoleName =
  | "STUDENT"
  | "ALUMNI"
  | "FACULTY"
  | "STAFF"
  | "MODERATOR"
  | "ALUMNI_COORDINATOR"
  | "TP_ADMIN"
  | "INSTITUTE_ADMIN"
  | "SUPER_ADMIN";

const DOMAIN = process.env.E2E_INSTITUTIONAL_DOMAIN ?? "nitap.ac.in";
const BASE_URL =
  process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000";

const clientIp = () =>
  `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

/** Uncaught page errors per member — see messaging.spec.ts for why hydration failures matter here. */
const pageErrors = new WeakMap<Page, string[]>();
const hydrationErrors = (page: Page) =>
  (pageErrors.get(page) ?? []).filter((m) => m.includes("Hydration failed"));

async function member(
  browser: Browser
): Promise<{ page: Page; email: string }> {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { "x-forwarded-for": clientIp() },
  });
  const page = await context.newPage();
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  const email = unique(DOMAIN);
  await register(page, email);
  await confirmEmail(page, email);
  await signIn(page, email);
  await expect(page).toHaveURL(/\/dashboard$/);
  return { page, email };
}

/**
 * Direct DB access against the same dev database the webServer runs against (mirrors
 * apps/web/scripts/seed-dev-admin.ts's connection setup). There is no self-service admin UI to promote a
 * member to a reviewer role this phase, so e2e reviewer fixtures are seeded straight into user_role, the
 * same way tests/security/community.security.integration.test.ts's grantRole does against a test database.
 */
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function userId(email: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    'select id from "user" where email = $1',
    [email]
  );
  if (!rows[0]) throw new Error(`No user seeded for ${email}`);
  return rows[0].id;
}

async function grantRole(email: string, roleName: RoleName): Promise<void> {
  const id = await userId(email);
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

/** Locates a feed post's <article> by its (unique) rendered content. */
const postArticle = (page: Page, content: string) =>
  page.locator("article", { hasText: content });

test.describe("community journey", () => {
  test("J-12 create post, comment, react, then the author deletes it", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const asha = await member(browser);
    const ravi = await member(browser);
    const content = `Hello from Asha ${unique(DOMAIN)}`;

    // Asha creates a text post from /feed and sees it rendered there.
    await asha.page.goto("/feed");
    await asha.page.getByLabel("Content").fill(content);
    await asha.page.getByRole("button", { name: "Post" }).click();
    await expect(postArticle(asha.page, content)).toBeVisible({
      timeout: 15_000,
    });

    // Ravi sees the post in his own feed, comments on it, and reacts to it.
    await ravi.page.goto("/feed");
    const raviArticle = postArticle(ravi.page, content);
    await expect(raviArticle).toBeVisible({ timeout: 15_000 });
    await raviArticle.getByRole("link", { name: "Comments" }).click();
    await expect(ravi.page).toHaveURL(/\/feed\/[0-9a-f-]{36}$/);
    const commentBody = `Nice post, Asha! ${unique(DOMAIN)}`;
    await ravi.page.getByLabel("Add a comment").fill(commentBody);
    await ravi.page.getByRole("button", { name: "Post comment" }).click();
    await expect(ravi.page.getByText(commentBody)).toBeVisible({
      timeout: 15_000,
    });
    const postId = ravi.page.url().split("/").pop()!;

    await ravi.page.goto("/feed");
    await raviArticle.getByRole("button", { name: "Like" }).click();
    // FeedList hardcodes `mine: null` for every viewer (feed-list.tsx), so a reaction never renders
    // anywhere in the feed UI — not even back to the person who made it. That is a documented,
    // deliberate simplification (feed-list.tsx's own "ponytail:" comment), not a bug this task patches.
    // The only durable evidence of the reaction is the row it writes, so assert that directly.
    await expect(async () => {
      const raviId = await userId(ravi.email);
      const { rows } = await pool.query<{ type: string }>(
        "select type from reaction where post_id = $1 and user_id = $2",
        [postId, raviId]
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.type).toBe("LIKE");
    }).toPass({ timeout: 15_000 });

    // Asha refreshes and sees Ravi's comment.
    await asha.page.goto(`/feed/${postId}`);
    await expect(asha.page.getByText(commentBody)).toBeVisible({
      timeout: 15_000,
    });

    // Asha deletes her own post; it disappears from the feed for both of them on refresh.
    await asha.page.goto("/feed");
    await postArticle(asha.page, content)
      .getByRole("button", { name: "Delete" })
      .click();
    await expect(postArticle(asha.page, content)).toHaveCount(0, {
      timeout: 15_000,
    });
    await ravi.page.goto("/feed");
    await expect(postArticle(ravi.page, content)).toHaveCount(0, {
      timeout: 15_000,
    });

    for (const { page } of [asha, ravi])
      expect(hydrationErrors(page)).toEqual([]);
  });

  /**
   * Was BLOCKED (see task-14-report.md for the original write-up): `/achievements` always rendered
   * `isReviewer={false}` and there was no query listing anyone else's SUBMITTED achievements. Fixed by
   * `list-pending-achievements.ts` (gated on `ACHIEVEMENT_REVIEW`, lists across all users) plus a
   * "Pending review" section on the same page, rendered only for actors holding that permission.
   */
  test("submit achievement, moderator approves, it appears in the feed as an ACHIEVEMENT post", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const asha = await member(browser);
    const moderator = await member(browser);
    await grantRole(asha.email, "ALUMNI"); // holds achievement.submit (STUDENT baseline does not)
    await grantRole(moderator.email, "ALUMNI_COORDINATOR"); // holds achievement.review

    await asha.page.goto("/achievements");
    const title = `Best Paper Award ${unique(DOMAIN)}`;
    const description = "Awarded for outstanding research contribution.";
    await asha.page.getByLabel("Title").fill(title);
    await asha.page.getByLabel("Description").fill(description);
    await asha.page.getByRole("button", { name: "Submit" }).click();
    await expect(asha.page.getByText(title)).toBeVisible({ timeout: 15_000 });
    await expect(asha.page.getByText("SUBMITTED")).toBeVisible();

    // The moderator opens the same page (there is no dedicated reviewer queue this phase) and sees
    // Asha's submission under "Pending review".
    await moderator.page.goto("/achievements");
    await expect(moderator.page.getByText("Pending review")).toBeVisible();
    const pendingCard = moderator.page
      .locator("li", { hasText: title })
      .filter({ has: moderator.page.getByRole("button", { name: "Approve" }) });
    await expect(pendingCard).toBeVisible({ timeout: 15_000 });
    await pendingCard.getByRole("button", { name: "Approve" }).click();
    await expect(pendingCard).toHaveCount(0, { timeout: 15_000 });

    // Approving publishes the achievement as an ACHIEVEMENT post (C-12); it shows up in the feed.
    await moderator.page.goto("/feed");
    await expect(postArticle(moderator.page, title)).toBeVisible({
      timeout: 15_000,
    });
    await expect(postArticle(moderator.page, title)).toContainText(description);

    for (const { page } of [asha, moderator])
      expect(hydrationErrors(page)).toEqual([]);
  });

  /**
   * Was BLOCKED (see task-14-report.md for the original write-up): the Resolve/Dismiss affordance was
   * session-local React state, invisible to any account other than the one that just filed the report.
   * Fixed by joining `report` into `listFeed` (`PostRow.openReportId`), so any actor holding
   * `report.review` sees the same durable state — including one who never filed the report themself.
   *
   * The Report button itself is still gated on `canModerate` (`post.moderate`/`report.review`), not
   * `report.create` — a plain member has no Report affordance in the feed UI. That's a separate,
   * documented gap this task's scope does not touch (see the controller's Fix 2 scope), so the reporter
   * here is granted MODERATOR too, purely so the button is visible to file the report.
   */
  test("report a post, moderator resolves, it disappears from both feeds", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const asha = await member(browser);
    const ravi = await member(browser);
    const moderator = await member(browser);
    await grantRole(ravi.email, "MODERATOR"); // so the Report affordance is even visible to him
    await grantRole(moderator.email, "MODERATOR"); // resolves; must not be the reporter (SELF_REVIEW_FORBIDDEN)

    const content = `Reportable post ${unique(DOMAIN)}`;
    await asha.page.goto("/feed");
    await asha.page.getByLabel("Content").fill(content);
    await asha.page.getByRole("button", { name: "Post" }).click();
    await expect(postArticle(asha.page, content)).toBeVisible({
      timeout: 15_000,
    });

    await ravi.page.goto("/feed");
    const raviArticle = postArticle(ravi.page, content);
    await raviArticle.getByRole("button", { name: "Report" }).click();
    await ravi.page.getByLabel("Reason").fill("Testing the report flow");
    await ravi.page.getByRole("button", { name: "Submit" }).click();
    await expect(
      raviArticle.getByRole("button", { name: "Resolve" })
    ).toBeVisible({ timeout: 15_000 });

    // A separate moderator, who never filed the report, opens the feed and sees the same, real, durable
    // Resolve/Dismiss affordance (not session-local state, which only the filer's own browser could ever
    // have seen) and resolves it. (Ravi filing it himself means *his* click would be refused
    // SELF_REVIEW_FORBIDDEN server-side — the UI doesn't hide the button per-filer, so a separate
    // moderator account is used to actually resolve.)
    // Resolve/Dismiss affordance (not session-local state) and resolves it.
    await moderator.page.goto("/feed");
    const modArticle = postArticle(moderator.page, content);
    await expect(
      modArticle.getByRole("button", { name: "Resolve" })
    ).toBeVisible({ timeout: 15_000 });
    await modArticle.getByRole("button", { name: "Resolve" }).click();
    await moderator.page.getByLabel("Reason").selectOption("SPAM");
    await moderator.page
      .getByRole("button", { name: "Resolve report" })
      .click();
    await expect(modArticle).toHaveCount(0, { timeout: 15_000 });

    // Resolving soft-deletes the reported content; it disappears from both feeds.
    await asha.page.goto("/feed");
    await expect(postArticle(asha.page, content)).toHaveCount(0, {
      timeout: 15_000,
    });
    await ravi.page.goto("/feed");
    await expect(postArticle(ravi.page, content)).toHaveCount(0, {
      timeout: 15_000,
    });

    for (const { page } of [asha, ravi, moderator])
      expect(hydrationErrors(page)).toEqual([]);
  });
});
