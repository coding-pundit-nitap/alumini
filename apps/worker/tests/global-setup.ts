import type { TestProject } from "vitest/node";

import { provideTemplateDatabase } from "@nitap/testing/global-setup";

/** The pipeline test needs PostgreSQL (its own template database) and the queue Redis. */
export default async function setup(project: TestProject) {
  return provideTemplateDatabase(project, {
    name: "worker",
    requiredEnv: ["DATABASE_URL", "QUEUE_REDIS_URL", "REDIS_URL"],
  });
}
