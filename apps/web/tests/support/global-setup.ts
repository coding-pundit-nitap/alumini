import type { TestProject } from "vitest/node";

import { provideTemplateDatabase } from "@nitap/testing/global-setup";

/** Web's integration suite needs PostgreSQL and the cache Redis (strategy §6.2). */
export default async function setup(project: TestProject) {
  return provideTemplateDatabase(project, {
    name: "web",
    requiredEnv: ["DATABASE_URL", "REDIS_URL"],
  });
}
