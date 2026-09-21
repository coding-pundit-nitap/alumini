import type { OutboxWriter } from "@nitap/database/outbox";

import type { TransactionRunner } from "@/infrastructure/database/transaction-runner";

import type { EmailOutbox } from "../application/auth-emails";

/**
 * One transaction per message. The writer validates the payload against the `email.send` contract
 * first, so a malformed message throws here and nothing is written.
 */
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
