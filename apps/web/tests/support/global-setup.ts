import type { TestProject } from "vitest/node";

import { provideTemplateDatabase } from "@nitap/testing/global-setup";

/** Web's integration suite needs PostgreSQL and the cache Redis. */
export default async function setup(project: TestProject) {
  return provideTemplateDatabase(project, {
    name: "web_" + project.name,
    requiredEnv: ["DATABASE_URL", "REDIS_URL"],
  });
}
