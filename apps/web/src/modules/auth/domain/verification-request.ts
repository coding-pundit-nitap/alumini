import { classifyEmail, type EmailPolicy } from "./email-policy";

export type VerificationStatus = "PENDING" | "APPROVED" | "REJECTED";
export type CrossCheck = "NOT_CHECKED" | "MATCH" | "MISMATCH";
export type VerificationDecision = "APPROVED" | "REJECTED";

/**
 * How an account gets verified. A recognised institutional domain that needs the institute's
 * confirmation (`autoVerify: false`, i.e. faculty and staff) is NOT an alumni evidence case: it waits
 * for admin tooling, and an alumni approval must never hand it the ALUMNI role.
 */
export type VerificationTrack = "EVIDENCE" | "AWAITING_STAFF_CONFIRMATION";

/** Three rejected requests lock an account: "contact the alumni office". */
export const MAX_REJECTED_SUBMISSIONS = 3;

export const REVIEW_NOTE_MAX = 1000;

/** Account states from which a decision may move an account. */
export const REVIEWABLE_ACCOUNT_STATES = ["PENDING", "REJECTED"] as const;

export function verificationTrack(
  email: string,
  policy: EmailPolicy
): VerificationTrack {
  const emailClass = classifyEmail(email, policy);
  return emailClass.kind === "INSTITUTIONAL" && !emailClass.autoVerify
    ? "AWAITING_STAFF_CONFIRMATION"
    : "EVIDENCE";
}

export type SubmissionBlock =
  "NOT_ELIGIBLE_STATE" | "STAFF_TRACK" | "REQUEST_OPEN" | "LOCKED";

/** Why a submission is refused, or null when it may proceed. Checked in this order. */
export function submissionBlock(input: {
  accountState: string;
  track: VerificationTrack;
  hasOpenRequest: boolean;
  rejectedCount: number;
}): SubmissionBlock | null {
  if (
    !(REVIEWABLE_ACCOUNT_STATES as readonly string[]).includes(
      input.accountState
    )
  ) {
    return "NOT_ELIGIBLE_STATE";
  }
  if (input.track === "AWAITING_STAFF_CONFIRMATION") return "STAFF_TRACK";
  if (input.hasOpenRequest) return "REQUEST_OPEN";
  if (input.rejectedCount >= MAX_REJECTED_SUBMISSIONS) return "LOCKED";
  return null;
}

/** Trims; blank means no note. */
export function normaliseNote(note: string | null | undefined): string | null {
  const trimmed = note?.trim();
  return trimmed ? trimmed : null;
}

/** A message for the reviewer when the note is unacceptable for the decision, else null. */
export function noteProblem(
  decision: VerificationDecision,
  note: string | null
): string | null {
  if (decision === "REJECTED" && note === null) {
    return "A note is required when rejecting a request.";
  }
  if (note !== null && note.length > REVIEW_NOTE_MAX) {
    return `Use at most ${REVIEW_NOTE_MAX} characters.`;
  }
  return null;
}

export type HistoryEntry = {
  status: VerificationStatus;
  decidedAt: Date | null;
  note: string | null;
};

/** Earlier requests shown per applicant in the review queue. */
export const HISTORY_LIMIT = 5;

/** Earlier requests per applicant for the review queue. Input newest first per user. */
export function groupHistory(
  rows: readonly (HistoryEntry & { userId: string })[],
  limit = HISTORY_LIMIT
): Map<string, HistoryEntry[]> {
  const byUser = new Map<string, HistoryEntry[]>();
  for (const { userId, ...entry } of rows) {
    const list = byUser.get(userId) ?? [];
    if (list.length < limit) list.push(entry);
    byUser.set(userId, list);
  }
  return byUser;
}
