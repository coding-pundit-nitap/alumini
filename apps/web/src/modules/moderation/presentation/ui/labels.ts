import type { DismissReason, ResolveReason } from "../../domain/moderation";

export const REASON_LABELS: Record<ResolveReason | DismissReason, string> = {
  SPAM: "Spam",
  HARASSMENT: "Harassment",
  HATE: "Hate",
  MISINFORMATION: "Misinformation",
  PRIVACY: "Privacy",
  OTHER: "Other",
  NO_VIOLATION: "No violation",
  DUPLICATE: "Duplicate",
  INSUFFICIENT_CONTEXT: "Insufficient context",
};

export const TARGET_LABELS = {
  POST: "Post",
  COMMENT: "Comment",
  MESSAGE: "Message",
  USER: "User",
} as const;

export const STATUS_LABELS = {
  OPEN: "Open",
  UNDER_REVIEW: "Under review",
  RESOLVED: "Resolved",
  DISMISSED: "Dismissed",
} as const;
