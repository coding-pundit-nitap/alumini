import type { PayloadOf } from "./define-job.ts";
import { announcementPublished } from "./announcement.ts";
import {
  donationConfirmed,
  donationExpirePledges,
  donationNotReceived,
  donationPledged,
} from "./donation.ts";
import { connectionAccepted, connectionRequested } from "./connection.ts";
import { idempotencySweep } from "./idempotency.ts";
import { notificationRetentionSweep } from "./notification-retention.ts";
import { emailSend } from "./email.ts";
import { jobEvents } from "./job.ts";
import { jobExpire, jobExpired } from "./job-expire.ts";
import { eventJobs } from "./events.ts";
import { mentorshipJobs } from "./mentorship.ts";
import { messageSent } from "./message.ts";
import { outboxPrune } from "./scheduled.ts";
import { uploadScan, uploadSweep } from "./upload.ts";
import {
  achievementApproved,
  achievementRejected,
  achievementSubmitted,
  commentCreated,
  contentRemoved,
  postCreated,
  reactionAdded,
  reportFiled,
  reportResolved,
} from "./community.ts";
import {
  userReactivated,
  userSuspended,
  verificationDecided,
} from "./account.ts";

/** Jobs a use case can request by writing an outbox event. */
export const OUTBOX_EVENTS = {
  "email.send": emailSend,
  "connection.requested": connectionRequested,
  "connection.accepted": connectionAccepted,
  "upload.scan": uploadScan,
  "message.sent": messageSent,
  "post.created": postCreated,
  "comment.created": commentCreated,
  "reaction.added": reactionAdded,
  "achievement.submitted": achievementSubmitted,
  "achievement.approved": achievementApproved,
  "achievement.rejected": achievementRejected,
  "report.filed": reportFiled,
  "report.resolved": reportResolved,
  "content.removed": contentRemoved,
  "job.expired": jobExpired,
  "verification.decided": verificationDecided,
  "user.suspended": userSuspended,
  "user.reactivated": userReactivated,
  "announcement.published": announcementPublished,
  "donation.pledged": donationPledged,
  "donation.confirmed": donationConfirmed,
  "donation.not-received": donationNotReceived,
  ...mentorshipJobs,
  ...jobEvents,
  ...eventJobs,
} as const;

/**
 * Every job the worker knows, including scheduled ones that no outbox event
 * produces.
 */
export const JOBS = {
  ...OUTBOX_EVENTS,
  "outbox.prune": outboxPrune,
  "upload.sweep": uploadSweep,
  "idempotency.sweep": idempotencySweep,
  "job.expire": jobExpire,
  "notification.retention-sweep": notificationRetentionSweep,
  "donation.expire-pledges": donationExpirePledges,
} as const;

export type OutboxEventType = keyof typeof OUTBOX_EVENTS;

/** A typed event a use case may write: the payload type follows the event type. */
export type OutboxEvent = {
  [K in OutboxEventType]: {
    type: K;
    payload: PayloadOf<(typeof OUTBOX_EVENTS)[K]>;
  };
}[OutboxEventType];

export function isOutboxEventType(value: string): value is OutboxEventType {
  return Object.hasOwn(OUTBOX_EVENTS, value);
}
