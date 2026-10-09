import type { AccountStatePayload } from "@nitap/jobs";
import type { Permission } from "@nitap/database/permissions";

import type { AccountStateValue } from "../domain/lifecycle";

export type AccountOutboxEvent = {
  type: "user.suspended" | "user.reactivated";
  payload: AccountStatePayload;
};

export type TargetUser = {
  id: string;
  accountState: AccountStateValue;
  roles: string[];
};

export type GrantRow = {
  id: string;
  userId: string;
  permission: Permission;
  scope: "GLOBAL" | "CHAPTER";
  chapterId: string | null;
  expiresAt: Date | null;
};

export type AccessAuditEntry = {
  action:
    | "user.suspended"
    | "user.deactivated"
    | "user.reactivated"
    | "role.assigned"
    | "role.revoked"
    | "permission.granted"
    | "permission.revoked";
  actorId: string;
  targetUserId: string;
  /** Identifiers and codes only. */
  metadata: Record<string, string | number | null | readonly string[]>;
};

/** Every write happens through one of these, inside ONE transaction, with its audit row. */
export type AccessTx = {
  /** Locks the user row (FOR UPDATE) and returns its state and role names; null when absent. */
  findUserForUpdate(id: string): Promise<TargetUser | null>;
  /** Guarded on `from`; false when the row had already moved. */
  setAccountState(
    id: string,
    from: AccountStateValue,
    to: AccountStateValue,
    deactivatedAt: Date | null
  ): Promise<boolean>;
  /** Returns how many sessions were deleted. */
  deleteSessions(userId: string): Promise<number>;
  /** Locks every super-admin user_role row, then returns the ids of VERIFIED super admins. */
  lockSuperAdmins(): Promise<readonly string[]>;
  /** Throws ConflictError("ROLE_ALREADY_HELD") on a duplicate. */
  insertUserRole(
    userId: string,
    role: string,
    grantedBy: string
  ): Promise<void>;
  deleteUserRole(userId: string, role: string): Promise<boolean>;
  findChapter(id: string): Promise<{ id: string; archived: boolean } | null>;
  /** Throws ConflictError("GRANT_EXISTS") on a duplicate. */
  insertGrant(
    input: Omit<GrantRow, "id"> & { grantedBy: string }
  ): Promise<GrantRow>;
  findGrant(userId: string, grantId: string): Promise<GrantRow | null>;
  deleteGrant(grantId: string): Promise<void>;
  audit(entry: AccessAuditEntry): Promise<void>;
  /** Writes an outbox event in this transaction. */
  enqueue(event: AccountOutboxEvent): Promise<void>;
};

export type AccessStore = {
  transaction<T>(work: (tx: AccessTx) => Promise<T>): Promise<T>;
};
