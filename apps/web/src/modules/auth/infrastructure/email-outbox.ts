import type { OutboxWriter } from "@nitap/database/outbox";

import type { TransactionRunner } from "@/infrastructure/database/transaction-runner";

import type { EmailOutbox } from "../application/auth-emails";

/** The payload is validated against the `email.send` contract before anything is written. */
export function createEmailOutbox(deps: {
  runner: Pick<TransactionRunner, "run">;
  writer: OutboxWriter;
}): EmailOutbox {
  return {
    async enqueue(payload) {
      await deps.runner.run((tx) =>
        deps.writer.add(tx, { type: "email.send", payload })
      );
    },
  };
}
