export type NotificationDomain =
  | "CONNECTION"
  | "MENTORSHIP"
  | "JOB"
  | "EVENT"
  | "MESSAGE"
  | "POST"
  | "ACHIEVEMENT"
  | "MODERATION"
  | "ANNOUNCEMENT";

const EVENT_TYPE_TO_DOMAIN: Record<string, NotificationDomain> = {
  "connection.requested": "CONNECTION",
  "connection.accepted": "CONNECTION",
  "mentorship.requested": "MENTORSHIP",
  "mentorship.accepted": "MENTORSHIP",
  "mentorship.declined": "MENTORSHIP",
  "mentorship.cancelled": "MENTORSHIP",
  "mentorship.started": "MENTORSHIP",
  "mentorship.completed": "MENTORSHIP",
  "job.submitted": "JOB",
  "job.published": "JOB",
  "job.rejected": "JOB",
  "job.closed": "JOB",
  "job.expired": "JOB",
  "event.cancelled": "EVENT",
  "event.registered": "EVENT",
  "event.registration-cancelled": "EVENT",
  "message.sent": "MESSAGE",
  "comment.created": "POST",
  "achievement.submitted": "ACHIEVEMENT",
  "achievement.approved": "ACHIEVEMENT",
  "achievement.rejected": "ACHIEVEMENT",
  "report.filed": "MODERATION",
  "report.resolved": "MODERATION",
  "content.removed": "MODERATION",
  "announcement.published": "ANNOUNCEMENT",
};

/** Single source of truth for "which preferences-UI toggle governs this event type" (N-14). Every
 * processor in Part C and the preferences form (Task 19) both call this — never hardcode the mapping
 * a second time. TRANSACTIONAL types (verification.decided, user.*) have no domain: deliver() never asks
 * for their preference (spec D12-4). */
export function domainFor(type: string): NotificationDomain {
  const domain = EVENT_TYPE_TO_DOMAIN[type];
  if (!domain)
    throw new Error(`No notification domain mapped for type "${type}".`);
  return domain;
}
