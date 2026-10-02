import { test as base } from "@playwright/test";

import { clientIp } from "./verification";

export { expect, type Browser, type Page } from "@playwright/test";

/**
 * Playwright's `test` with a distinct client address per test for the built-in `page`, `context` and `request`
 * fixtures. Better Auth limits sign-up and sign-in per IP in production builds, which CI serves; without
 * this every journey on the default fixtures would share 127.0.0.1 and one limit. Contexts a spec opens
 * itself set their own address (see `clientIp`).
 */
export const test = base.extend({
  extraHTTPHeaders: async ({ extraHTTPHeaders }, provide) => {
    await provide({ ...extraHTTPHeaders, "x-forwarded-for": clientIp() });
  },
});
