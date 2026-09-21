import { createOutboxWriter } from "@nitap/database/outbox";

import { createPrismaClient } from "../src/prisma.ts";

/**
 * Manual end-to-end check against the running local stack: writes one email event in a transaction,
 * then waits for Mailpit to show it. Needs `pnpm docker:up` and a running worker (`pnpm worker:dev`).
 */
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");
const mailpit = `http://localhost:${process.env.MAILPIT_UI_PORT ?? 8025}`;

const to = `smoke-${Date.now()}@example.test`;
const prisma = createPrismaClient(databaseUrl);
try {
  await prisma.$transaction((tx) =>
    createOutboxWriter().add(tx, {
      type: "email.send",
      payload: {
        v: 1,
        to,
        template: "verify-email",
        params: {
          verificationUrl: "https://alumni.example/verify?token=smoke",
          expiresInMinutes: 60,
        },
      },
    })
  );
} finally {
  await prisma.$disconnect();
}

type Mailbox = { messages?: { Subject: string; To: { Address: string }[] }[] };

async function findMessage() {
  try {
    const response = await fetch(`${mailpit}/api/v1/messages`);
    const body = (await response.json()) as Mailbox;
    return body.messages?.find((m) => m.To.some((t) => t.Address === to));
  } catch {
    return undefined; // Mailpit is down or restarting: keep waiting, that is the outage case
  }
}

const deadline = Date.now() + 30_000;
while (Date.now() < deadline) {
  const found = await findMessage();
  if (found) {
    console.log(`delivered to Mailpit: "${found.Subject}"`);
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}
console.error(
  "not delivered within 30 s: is the worker running (pnpm worker:dev) and Mailpit up?"
);
process.exit(1);
