/**
 * Retrying cannot help (a 5xx from the mailbox, an invalid payload). The job
 * goes straight to the DLQ.
 */
export class PermanentJobError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PermanentJobError";
  }
}

/**
 * Not ready to run yet (e.g. a payload version this worker does not know).
 * Reschedule without using an attempt.
 */
export class DeferJobError extends Error {
  readonly delayMs: number;

  constructor(delayMs: number, message = "deferred") {
    super(message);
    this.name = "DeferJobError";
    this.delayMs = delayMs;
  }
}
