import type { AccountState } from "@nitap/database/enums";

export type AccountStateValue =
  (typeof AccountState)[keyof typeof AccountState];

/** The states an admin can move an account to (spec B12-1). */
export const TARGET_STATES = ["SUSPENDED", "DEACTIVATED", "VERIFIED"] as const;
export type TargetState = (typeof TARGET_STATES)[number];

// Only a VERIFIED account can enter SUSPENDED/DEACTIVATED, so returning to VERIFIED never promotes an
// unverified account.
const FROM: Record<TargetState, readonly AccountStateValue[]> = {
  SUSPENDED: ["VERIFIED"],
  DEACTIVATED: ["VERIFIED", "SUSPENDED"],
  VERIFIED: ["SUSPENDED", "DEACTIVATED"],
};

export const canTransition = (
  from: AccountStateValue,
  to: TargetState
): boolean => FROM[to].includes(from);

/** A code, not free text: audit metadata holds identifiers only (spec C-3). */
export const SUSPENSION_REASONS = [
  "SPAM",
  "HARASSMENT",
  "IMPERSONATION",
  "POLICY_VIOLATION",
  "SECURITY",
  "OTHER",
] as const;
export type SuspensionReason = (typeof SUSPENSION_REASONS)[number];

export const STATE_AUDIT_ACTION = {
  SUSPENDED: "user.suspended",
  DEACTIVATED: "user.deactivated",
  VERIFIED: "user.reactivated",
} as const satisfies Record<TargetState, string>;
