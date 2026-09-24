/** Shared copy for the users pages and dialogs. */
export const STATE_LABEL: Record<string, string> = {
  PENDING: "Pending",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
  SUSPENDED: "Suspended",
  DEACTIVATED: "Deactivated",
};
export const REASON_LABEL: Record<string, string> = {
  SPAM: "Spam",
  HARASSMENT: "Harassment",
  IMPERSONATION: "Impersonation",
  POLICY_VIOLATION: "Policy violation",
  SECURITY: "Security concern",
  OTHER: "Other",
};
export const TRANSITION = {
  SUSPENDED: {
    verb: "Suspend",
    effect: "They will be signed out and can only see their account status.",
  },
  DEACTIVATED: {
    verb: "Deactivate",
    effect: "They will be signed out and cannot sign in.",
  },
  VERIFIED: {
    verb: "Reinstate",
    effect: "Their roles and permissions take effect again.",
  },
} as const;
export const USER_FILTER_LABELS: Record<string, string> = {
  q: "Search",
  state: "State",
  role: "Role",
  limit: "Page size",
  cursor: "Page",
};
export const LAST_SUPER_ADMIN_NOTE = "This is the last active Super Admin.";
export const SELECT_CLASS =
  "border-input bg-background h-9 rounded-lg border px-2.5 text-sm";
