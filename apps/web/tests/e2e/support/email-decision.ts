import { createRequire } from "node:module";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@nitap/database";

/**
 * Waits for the latest `connection.accepted` job for this member to complete, then prints how many
 * EMAIL delivery rows its notification has. 0 means no email was queued.
 *
 * Standalone because the Prisma client needs ESM. Reads DATABASE_URL and QUEUE_REDIS_URL; the
 * recipient's email is argv[2].
 */
type JobQueue = {
  getJobState(id: string): Promise<string>;
  close(): Promise<void>;
};
// bullmq is a dependency of @nitap/queue, not of the web app: resolve the worker's own copy through it.
const { Queue } = createRequire(import.meta.resolve("@nitap/queue"))(
  "bullmq"
) as {
  Queue: new (
    name: string,
    options: { connection: { host: string; port: number; password?: string } }
  ) => JobQueue;
};

async function main() {
  const [email] = process.argv.slice(2);
  const connectionString = process.env.DATABASE_URL;
  const queueUrl = process.env.QUEUE_REDIS_URL;
  if (!email || !connectionString || !queueUrl) {
    throw new Error(
      "usage: email-decision.ts <email> (needs DATABASE_URL, QUEUE_REDIS_URL)"
    );
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  const url = new URL(queueUrl);
  const queue = new Queue("default", {
    connection: {
      host: url.hostname,
      port: Number(url.port || 6379),
      password: url.password || undefined,
    },
  });
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const event = await prisma.outboxEvent.findFirstOrThrow({
      where: {
        type: "connection.accepted",
        payload: { path: ["recipientId"], equals: user.id },
      },
      orderBy: { createdAt: "desc" },
    });

    // Bounded only so a broken worker fails the spec instead of hanging it; not a tuned window.
    const deadline = Date.now() + 20_000;
    for (;;) {
      const state = await queue.getJobState(event.id);
      if (state === "completed") break;
      if (state === "failed") throw new Error(`job ${event.id} failed`);
      if (Date.now() > deadline) {
        throw new Error(`job ${event.id} still ${state}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    const notification = await prisma.notification.findFirstOrThrow({
      where: { recipientId: user.id, type: "connection.accepted" },
      include: { deliveries: { where: { channel: "EMAIL" } } },
    });
    process.stdout.write(
      JSON.stringify({ emailDeliveries: notification.deliveries.length })
    );
  } finally {
    await queue.close();
    await prisma.$disconnect();
  }
}

await main();
