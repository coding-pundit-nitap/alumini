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

/** Which preferences toggle governs an event type. TRANSACTIONAL types have no domain. */
export function domainFor(type: string): NotificationDomain {
  const domain = EVENT_TYPE_TO_DOMAIN[type];
  if (!domain)
    throw new Error(`No notification domain mapped for type "${type}".`);
  return domain;
}
