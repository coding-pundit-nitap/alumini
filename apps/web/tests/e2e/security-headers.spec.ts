import { expect, test, type Page } from "@playwright/test";

import { confirmEmail, register, signIn, unique } from "./support/accounts";
import { clientIp } from "./support/verification";

// Strategy §10.1 "Headers", spec 16 SD-1…SD-3: the nonce CSP must not break any page, and the inline
// theme script must run because it carries the nonce, not because the policy is loose.

const DOMAIN = process.env.E2E_INSTITUTIONAL_DOMAIN ?? "nitap.ac.in";
const BASE_URL =
  process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000";

/** Records every CSP violation the page reports, from before its first script runs. */
async function watchViolations(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __cspViolations: string[] }).__cspViolations = seen;
    document.addEventListener("securitypolicyviolation", (event) => {
      seen.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  const console: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy/i.test(message.text()))
      console.push(message.text());
  });
  return async () => [
    ...(await page.evaluate(
      () =>
        (window as unknown as { __cspViolations?: string[] }).__cspViolations ??
        []
    )),
    ...console,
  ];
}

test.describe("security headers", () => {
  test("a page carries the nonce CSP and the static headers", async ({
    request,
  }) => {
    const response = await request.get("/login");
    const headers = response.headers();
    expect(headers["content-security-policy"]).toMatch(
      /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/
    );
    expect(headers["content-security-policy"]).toContain(
      "frame-ancestors 'none'"
    );
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["permissions-policy"]).toContain("camera=()");
    expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
    expect(headers["x-powered-by"]).toBeUndefined();
  });

  test("the HTML's scripts carry this response's nonce", async ({
    request,
  }) => {
    const response = await request.get("/login");
    const nonce = /'nonce-([^']+)'/.exec(
      response.headers()["content-security-policy"]!
    )![1];
    const html = await response.text();
    const scripts = html.match(/<script\b[^>]*>/g) ?? [];
    expect(scripts.length).toBeGreaterThan(0);
    for (const tag of scripts) expect(tag).toContain(`nonce="${nonce}"`);
  });

  test("API and health responses load nothing and are not framable", async ({
    request,
  }) => {
    for (const path of ["/api/v1/jobs", "/health/live"]) {
      const headers = (await request.get(path)).headers();
      expect(headers["content-security-policy"]).toBe(
        "default-src 'none'; frame-ancestors 'none'"
      );
      expect(headers["x-content-type-options"]).toBe("nosniff");
    }
  });

  test("public pages render with no CSP violation, and the nonce'd theme script runs", async ({
    page,
    context,
  }) => {
    await context.addCookies([{ name: "theme", value: "dark", url: BASE_URL }]);
    const violations = await watchViolations(page);
    for (const path of ["/", "/login", "/register"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      // Only the inline theme script sets this before hydration.
      expect(
        await page.evaluate(() => document.documentElement.style.colorScheme)
      ).toBe("dark");
      expect(await violations()).toEqual([]);
    }
  });

  test("signed-in pages render with no CSP violation", async ({ browser }) => {
    // Nine pages, each compiled on first visit under `next dev`.
    test.setTimeout(120_000);
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

    const violations = await watchViolations(page);
    for (const path of [
      "/dashboard",
      "/directory",
      "/feed",
      "/jobs",
      "/events",
      "/messages",
      "/notifications",
      "/profile",
      "/settings",
    ]) {
      // "load", not "networkidle": the signed-in shell holds the message stream open.
      await page.goto(path, { waitUntil: "load" });
      expect(await violations(), path).toEqual([]);
    }
    await context.close();
  });
});
