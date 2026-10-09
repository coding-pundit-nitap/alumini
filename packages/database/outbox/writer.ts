import { OUTBOX_EVENTS } from "@nitap/jobs";
import type { OutboxEvent } from "@nitap/jobs";

import type { Prisma } from "../generated/prisma/client.ts";

/** A use case built an event that does not match its contract. A bug, caught before the commit. */
export class InvalidOutboxEventError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "InvalidOutboxEventError";
  }
}

/** Only the outbox delegate is needed, so the writer works with any transaction client. */
export type OutboxTransaction = Pick<Prisma.TransactionClient, "outboxEvent">;

export type OutboxWriter = {
  /** Writes in the caller's transaction. A malformed payload throws, rolling back the business change. */
  add(tx: OutboxTransaction, event: OutboxEvent): Promise<{ id: string }>;
};

export type OutboxWriterOptions = {
  /** Correlation id of the originating request, stored so worker logs join its trace. */
  requestId?: () => string | undefined;
};

export function createOutboxWriter(
  options: OutboxWriterOptions = {}
): OutboxWriter {
  return {
    async add(tx, event) {
      const definition = OUTBOX_EVENTS[event.type];
      const parsed = definition.schema.safeParse(event.payload);
      if (!parsed.success) {
        // Field paths and messages only: never the values (they can hold an address or a token).
        const problems = parsed.error.issues
          .map(
            (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`
          )
          .join("; ");
        throw new InvalidOutboxEventError(
          `Invalid payload for ${event.type}: ${problems}`
        );
      }
      const row = await tx.outboxEvent.create({
        data: {
          type: event.type,
          payload: parsed.data as Prisma.InputJsonValue,
          requestId: options.requestId?.() ?? null,
        },
        select: { id: true },
      });
      return { id: row.id };
    },
  };
}
