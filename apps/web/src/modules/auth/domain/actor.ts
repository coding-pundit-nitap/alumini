import type { Permission } from "./permission";

export const ACCOUNT_STATES = [
  "PENDING",
  "VERIFIED",
  "REJECTED",
  "SUSPENDED",
  "DEACTIVATED",
] as const;

export type AccountState = (typeof ACCOUNT_STATES)[number];

export function isAccountState(value: unknown): value is AccountState {
  return (
    typeof value === "string" &&
    (ACCOUNT_STATES as readonly string[]).includes(value)
  );
}

/** One effective permission held by a user (role-derived or direct). */
export type Grant =
  | { permission: Permission; scope: "GLOBAL"; expiresAt: Date | null }
  | {
      permission: Permission;
      scope: "CHAPTER";
      chapterId: string;
      expiresAt: Date | null;
    };

/**
 * The authenticated caller. `grants` is empty unless `accountState` is VERIFIED; it is
 * loaded once per request.
 */
export type Actor = {
  userId: string;
  accountState: AccountState;
  requestId: string;
  grants: readonly Grant[];
};

/** What `decide()` needs to know about the record being acted on. */
export type Resource = {
  /** The chapter the record belongs to, or none. A resource without a chapter matches only GLOBAL grants. */
  chapterId?: string | null;
  /** The user the action is about, for separation of duties. */
  subjectUserId?: string;
  /** Set when the record's existence is itself sensitive: a denial then answers 404, not 403. */
  concealed?: boolean;
};
