import { expect, test, type Browser, type Page } from "./support/test";

import { confirmEmail, register, signIn, unique } from "./support/accounts";

const DOMAIN = process.env.E2E_INSTITUTIONAL_DOMAIN ?? "nitap.ac.in";
const BASE_URL =
  process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000";

// A real 1x1 PNG: the worker checks magic bytes and re-encodes, so a fake file would be rejected.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const clientIp = () =>
  `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

async function member(browser: Browser): Promise<Page> {
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
  return page;
}

test("a member uploads a photo, sets it, and visibility governs who can fetch it", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const owner = await member(browser);
  const viewer = await member(browser);

  await owner.goto("/profile");
  // setInputFiles fires `change` at once; wait for hydration so React has attached its handler.
  await owner.waitForLoadState("networkidle");
  await owner.getByLabel(/choose a photo/i).setInputFiles({
    name: "me.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  // The worker scans asynchronously; the widget polls until the upload is READY.
  await owner
    .getByRole("button", { name: "Set as profile photo" })
    .click({ timeout: 45_000 });
  await expect(
    owner.getByRole("img", { name: /profile photo/i })
  ).toBeVisible();

  const memberUrl = await owner
    .getByRole("link", { name: "View my profile" })
    .getAttribute("href");
  const photoPath = `/api/photos/${memberUrl!.split("/").pop()}`;
  const fetchStatus = (page: Page) =>
    page.request.get(photoPath, { maxRedirects: 0 }).then((r) => r.status());

  // Default level: a verified member is redirected to a presigned URL; the owner too.
  expect(await fetchStatus(viewer)).toBe(302);
  expect(await fetchStatus(owner)).toBe(302);

  // A guest gets nothing until the profile is public.
  const guest = await (
    await browser.newContext({ baseURL: BASE_URL })
  ).newPage();
  expect(await fetchStatus(guest)).toBe(404);

  await owner.goto("/profile/privacy");
  await owner.getByLabel("Who can see your profile").selectOption({
    label: "Everyone, including people who are not signed in",
  });
  await owner.getByRole("button", { name: "Save privacy settings" }).click();
  await expect(owner.getByText("Privacy settings saved.")).toBeVisible();
  expect(await fetchStatus(guest)).toBe(302);

  // PRIVATE hides it from everyone but the owner, with the same 404 as a missing photo.
  await owner
    .getByLabel("Who can see your profile")
    .selectOption({ label: "Only me" });
  await owner.getByRole("button", { name: "Save privacy settings" }).click();
  await expect(owner.getByText("Privacy settings saved.")).toBeVisible();
  expect(await fetchStatus(viewer)).toBe(404);
  expect(await fetchStatus(owner)).toBe(302);
});
