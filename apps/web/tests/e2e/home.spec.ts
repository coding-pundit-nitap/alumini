import { expect, test } from "@playwright/test";

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
