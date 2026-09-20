import { createOutboxStore } from "@nitap/database/outbox";
import { createQueueAdmin } from "@nitap/queue";

import { runCommand } from "./cli/commands.ts";
import { loadCliEnv } from "./env.ts";
import { createPrismaClient } from "./prisma.ts";

const env = loadCliEnv(process.env);
const prisma = createPrismaClient(env.DATABASE_URL);
const admin = createQueueAdmin({ url: env.QUEUE_REDIS_URL });

async function main(): Promise<number> {
  try {
    return await runCommand(process.argv.slice(2), {
      store: createOutboxStore(prisma),
      admin,
      out: (line) => console.log(line),
      err: (line) => console.error(line),
      now: () => new Date(),
      retentionDays: 7,
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Unexpected error");
    return 1;
  } finally {
    await admin.close();
    await prisma.$disconnect();
  }
}

process.exit(await main());
