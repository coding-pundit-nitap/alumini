import type { TransactionRunner } from "@/infrastructure/database/transaction-runner";

/** Negative control: read, decide in JS, then write. Oversells under concurrency. Never use in the app. */
export function createNaiveEventStore(runner: Pick<TransactionRunner, "run">) {
  return {
    /** Resolves true when admitted, false when the (stale) read said the event was full. */
    register(eventId: string, userId: string): Promise<boolean> {
      return runner.run(async (db) => {
        const [event] = await db.$queryRaw<
          { registered_count: number; capacity: number }[]
        >`SELECT registered_count, capacity FROM event WHERE id = ${eventId}::uuid`;
        if (!event || event.registered_count >= event.capacity) return false;

        await db.$executeRaw`
          INSERT INTO event_registration (id, event_id, user_id, state, registered_at, updated_at)
          VALUES (gen_random_uuid(), ${eventId}::uuid, ${userId}::uuid, 'REGISTERED', now(), now())`;
        await db.$executeRaw`
          UPDATE event SET registered_count = ${event.registered_count + 1}, updated_at = now()
           WHERE id = ${eventId}::uuid`;
        return true;
      });
    },
  };
}
