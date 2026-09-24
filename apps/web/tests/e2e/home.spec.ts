import { expect, test } from "@playwright/test";

import { confirmEmail, register, signIn, unique } from "./support/accounts";
import { clientIp } from "./support/verification";

const DOMAIN = process.env.E2E_INSTITUTIONAL_DOMAIN ?? "nitap.ac.in";
const BASE_URL =
  process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000";

test.describe("Landing (§5.1.1)", () => {
  test("a visitor sees the pitch and can join", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Stay connected with your NIT Arunachal Pradesh community"
    );
    await expect(
      page.getByRole("link", { name: "Join the network" })
    ).toHaveAttribute("href", "/register");
    await expect(
      page.getByRole("main").getByRole("link", { name: "Log in" })
    ).toHaveAttribute("href", "/login");
    for (const name of [
      "Directory",
      "Mentorship",
      "Jobs & internships",
      "Events",
    ]) {
      await expect(page.getByRole("heading", { name, level: 3 })).toBeVisible();
    }
    await expect(
      page.getByRole("heading", { name: "How it works" })
    ).toBeVisible();
    await expect(page.locator("#privacy")).toBeVisible();
    await expect(page).toHaveTitle(/NIT Arunachal Pradesh Alumni Network/);
  });

  test("serves an Open Graph image", async ({ request }) => {
    const response = await request.get("/opengraph-image");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
  });
});

test.describe("Dashboard (§5.3.1)", () => {
  test("an anonymous visit redirects to login with next", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
  });

  test("a verified member lands on the dashboard and is sent back from the landing and login", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders: { "x-forwarded-for": clientIp() },
    });
    const page = await context.newPage();
    const email = unique(DOMAIN);
    await register(page, email);
    await confirmEmail(page, email);
    await signIn(page, email);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Welcome back, E2E"
    );
    await expect(page.getByText(/Profile \d+% complete/)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Opportunities for you" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Upcoming events" })
    ).toBeVisible();
    await page.goto("/");
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/login");
    await expect(page).toHaveURL(/\/dashboard$/);
    await context.close();
  });
});
