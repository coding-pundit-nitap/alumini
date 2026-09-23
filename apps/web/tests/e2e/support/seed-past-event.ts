import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@nitap/database";

/**
 * Seeds an event with a past `starts_at` plus one REGISTERED registrant, directly through Prisma.
 * The `/events/new` form refuses a start time that isn't in the future (validation.ts), so the
 * attendance journey (events.spec.ts) needs this fixture instead. Run as a standalone Node script
 * (`node --experimental-strip-types`), never imported into the Playwright spec: the generated Prisma
 * client uses `import.meta`, which Playwright's CJS test transform cannot load, but Next.js and plain
 * Node (both ESM) handle it the same way `scripts/seed-dev-admin.ts` does.
 *
 * Reads DATABASE_URL and DEV_COORDINATOR_EMAIL from the environment (same as the app); prints
 * `{ eventId, registrantName }` as JSON on stdout for the spec to parse.
 */
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const organizerEmail = process.env.DEV_COORDINATOR_EMAIL;
  if (!organizerEmail) throw new Error("DEV_COORDINATOR_EMAIL is not set");

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  try {
    const organizer = await prisma.user.findUniqueOrThrow({
      where: { email: organizerEmail },
    });

    const token = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    const registrantName = `Attendee ${token}`;
    const registrant = await prisma.user.create({
      data: {
        name: registrantName,
        email: `e2e-attendee-${token}@example.test`,
        accountState: "VERIFIED",
      },
    });
    await prisma.profile.create({
      data: { userId: registrant.id, fullName: registrantName },
    });

    const HOUR = 60 * 60 * 1000;
    const event = await prisma.event.create({
      data: {
        organizerId: organizer.id,
        title: `Past workshop ${token}`,
        description: "A workshop that already happened, seeded for E2E.",
        startsAt: new Date(Date.now() - 1 * HOUR),
        timezone: "UTC",
        location: "Campus Hall",
        isOnline: false,
        capacity: 10,
        registeredCount: 1,
        registrationDeadline: new Date(Date.now() - 2 * HOUR),
        status: "SCHEDULED",
      },
    });
    await prisma.eventRegistration.create({
      data: { eventId: event.id, userId: registrant.id, state: "REGISTERED" },
    });

    process.stdout.write(JSON.stringify({ eventId: event.id, registrantName }));
  } finally {
    await prisma.$disconnect();
  }
}

await main();
