import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@nitap/database";

/**
 * Seeds a past event with one registrant, since the form refuses past start times. Standalone because
 * the Prisma client needs ESM. Prints `{ eventId, registrantName }` as JSON.
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
