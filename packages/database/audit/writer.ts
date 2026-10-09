import type { Prisma } from "../generated/prisma/client.ts";

/** A use case built an audit entry that breaks the contract. A bug, caught before the commit. */
export class InvalidAuditEntryError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "InvalidAuditEntryError";
  }
}

export type AuditEntry = {
  actorId: string;
  /** `namespace.verb`, lowercase, e.g. `alumni.verified`. */
  action: string;
  targetType: string;
  targetId: string;
  /** Identifiers and outcomes only: never free text, an email address or a token. */
  metadata?: Readonly<Record<string, unknown>>;
};

/** Only the audit delegate is needed, so the writer works with any transaction client. */
export type AuditTransaction = Pick<Prisma.TransactionClient, "auditLog">;

export type AuditWriter = {
  /** Writes in the caller's transaction. The table is append-only (trigger). */
  record(tx: AuditTransaction, entry: AuditEntry): Promise<void>;
};

export type AuditWriterOptions = {
  /** Correlation id of the originating request, stored so an audit row joins its trace. */
  requestId?: () => string | undefined;
};

const ACTION = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

export function createAuditWriter(
  options: AuditWriterOptions = {}
): AuditWriter {
  return {
    async record(tx, entry) {
      if (entry.action.length > 100 || !ACTION.test(entry.action)) {
        throw new InvalidAuditEntryError(
          `Invalid audit action "${entry.action}": expected lowercase namespace.verb, at most 100 characters`
        );
      }
      const metadata = entry.metadata ?? {};
      if (
        typeof metadata !== "object" ||
        metadata === null ||
        Array.isArray(metadata)
      ) {
        throw new InvalidAuditEntryError(
          `Audit metadata for ${entry.action} must be a plain object`
        );
      }
      await tx.auditLog.create({
        data: {
          actorId: entry.actorId,
          action: entry.action,
          targetType: entry.targetType,
          targetId: entry.targetId,
          metadata: metadata as Prisma.InputJsonObject,
          requestId: options.requestId?.() ?? null,
        },
        select: { id: true },
      });
    },
  };
}
