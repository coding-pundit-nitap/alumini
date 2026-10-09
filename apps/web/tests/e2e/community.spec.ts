import { expect, test, type Browser, type Page } from "./support/test";

import { Pool } from "pg";

import { confirmEmail, register, signIn, unique } from "./support/accounts";

/**
 * Imports from `@nitap/database` pull in the generated Prisma client, which fails to load under
 * Playwright's transform, so a raw `pg` pool is used for the few queries needed here.
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

/** Uncaught page errors per member; hydration failures matter here (see messaging.spec.ts). */
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
 * Direct DB access against the dev database the webServer uses. There is no admin UI to promote a member
 * to a reviewer role, so reviewer fixtures are inserted straight into user_role.
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

/** The composer on Home starts collapsed behind a prompt button; opening it reveals the form. */
async function publishPost(page: Page, content: string) {
  await page
    .getByRole("button", { name: /Share something with your batchmates/ })
    .click();
  await page.getByLabel("Post content").fill(content);
  await page.getByRole("button", { name: "Post", exact: true }).click();
}

test.describe("community journey", () => {
  test("J-12 create post, comment, react, then the author deletes it", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const asha = await member(browser);
    const ravi = await member(browser);
    const content = `Hello from Asha ${unique(DOMAIN)}`;

    // Asha creates a text post from Home (/feed redirects there) and sees it rendered there.
    await asha.page.goto("/feed");
    await publishPost(asha.page, content);
    await expect(postArticle(asha.page, content)).toBeVisible({
      timeout: 15_000,
    });

    // Ravi sees the post in his own feed, comments on it, and reacts to it.
    await ravi.page.goto("/feed");
    const raviArticle = postArticle(ravi.page, content);
    await expect(raviArticle).toBeVisible({ timeout: 15_000 });
    await raviArticle
      .getByRole("link", { name: "Comment", exact: true })
      .click();
    await expect(ravi.page).toHaveURL(/\/feed\/[0-9a-f-]{36}$/);
    const commentBody = `Nice post, Asha! ${unique(DOMAIN)}`;
    await ravi.page.getByLabel("Add a comment").fill(commentBody);
    await ravi.page
      .getByRole("button", { name: "Comment", exact: true })
      .click();
    await expect(ravi.page.getByText(commentBody)).toBeVisible({
      timeout: 15_000,
    });
    const postId = ravi.page.url().split("/").pop()!;

    await ravi.page.goto("/feed");
    await raviArticle.getByRole("button", { name: "Like" }).click();
    // FeedList hardcodes `mine: null`, so a reaction never renders in the feed UI, even for its author.
    // Assert on the row it writes instead.
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
    // Delete lives in the post's options menu and asks for confirmation.
    await postArticle(asha.page, content)
      .getByRole("button", { name: "Post options" })
      .click();
    await asha.page.getByRole("menuitem", { name: "Delete" }).click();
    await asha.page
      .getByRole("alertdialog")
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

  /** Reviewers see a "Pending review" section on /achievements, listing other members' submissions. */
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
    await expect(asha.page.getByText("Awaiting review")).toBeVisible();

    // The moderator opens the same page and sees Asha's submission under "Pending review".
    await moderator.page.goto("/achievements");
    await expect(moderator.page.getByText("Pending review")).toBeVisible();
    const pendingCard = moderator.page
      .locator("li", { hasText: title })
      .filter({ has: moderator.page.getByRole("button", { name: "Approve" }) });
    await expect(pendingCard).toBeVisible({ timeout: 15_000 });
    await pendingCard.getByRole("button", { name: "Approve" }).click();
    await moderator.page
      .getByRole("button", { name: "Approve achievement" })
      .click();
    await expect(pendingCard).toHaveCount(0, { timeout: 15_000 });

    // Approving publishes the achievement as an ACHIEVEMENT post; it shows up in the feed.
    await moderator.page.goto("/feed");
    await expect(postArticle(moderator.page, title)).toBeVisible({
      timeout: 15_000,
    });
    await expect(postArticle(moderator.page, title)).toContainText(description);

    for (const { page } of [asha, moderator])
      expect(hydrationErrors(page)).toEqual([]);
  });

  /**
   * Any actor holding `report.review` sees the same durable Resolve/Dismiss state, including one who never
   * filed the report. The Report button is gated on `canModerate`, so the reporter is granted MODERATOR too.
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
    await publishPost(asha.page, content);
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

    // A separate moderator resolves it: the filer's own click would be refused with SELF_REVIEW_FORBIDDEN.
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
