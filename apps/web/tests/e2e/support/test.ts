import { test as base } from "@playwright/test";

import { clientIp } from "./verification";

export { expect, type Browser, type Page } from "@playwright/test";

/** Gives each test its own client IP so per-IP auth rate limits don't collide across tests. */
export const test = base.extend({
  extraHTTPHeaders: async ({ extraHTTPHeaders }, provide) => {
    await provide({ ...extraHTTPHeaders, "x-forwarded-for": clientIp() });
  },
});
