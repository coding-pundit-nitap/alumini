export type NotificationCopy = {
  title: string;
  body: string;
  actionPath: string;
};

/**
 * One line of copy per notification type, shared by the email and the in-app bell/inbox. Payload is ids-only,
 * so copy never names people — it says what happened generically (spec N-3). A payload id only deepens the
 * link; a missing or odd one (content gone, older row) falls back to the list page.
 */
export function renderNotificationCopy(
  type: string,
  payload: Record<string, unknown>
): NotificationCopy {
  const under = (base: string, key: string) => {
    const id = payload[key];
    return typeof id === "string" && /^[\w-]+$/.test(id)
      ? `${base}/${id}`
      : base;
  };
  const copy = (title: string, body: string, actionPath: string) => ({
    title,
    body,
    actionPath,
  });
  switch (type) {
    case "connection.requested":
      return copy(
        "New connection request",
        "You have a new connection request.",
        "/connections"
      );
    case "connection.accepted":
      return copy(
        "Connection accepted",
        "Someone accepted your connection request.",
        "/connections"
      );
    case "mentorship.requested":
      return copy(
        "New mentorship request",
        "A student has requested mentorship.",
        "/mentorship"
      );
    case "mentorship.accepted":
      return copy(
        "Mentorship accepted",
        "Your mentorship request was accepted.",
        "/mentorship"
      );
    case "mentorship.declined":
      return copy(
        "Mentorship declined",
        "Your mentorship request was declined.",
        "/mentorship"
      );
    case "mentorship.cancelled":
      return copy(
        "Mentorship cancelled",
        "A mentorship you were part of was cancelled.",
        "/mentorship"
      );
    case "mentorship.started":
      return copy(
        "Mentorship started",
        "Your mentorship has started.",
        "/mentorship"
      );
    case "mentorship.completed":
      return copy(
        "Mentorship completed",
        "Your mentorship was marked complete.",
        "/mentorship"
      );
    case "job.submitted":
      return copy(
        "New job posting needs review",
        "A job posting was submitted and is awaiting review.",
        "/jobs/moderation"
      );
    case "job.published":
      return copy(
        "Your job posting is live",
        "Your job posting was approved and published.",
        "/jobs/mine"
      );
    case "job.rejected":
      return copy(
        "Your job posting was rejected",
        "Your job posting was not approved.",
        "/jobs/mine"
      );
    case "job.closed":
      return copy(
        "Your job posting was closed",
        "Your job posting is now closed.",
        "/jobs/mine"
      );
    case "job.expired":
      return copy(
        "Your job posting expired",
        "Your job posting reached its expiry date.",
        "/jobs/mine"
      );
    case "event.cancelled":
      return copy(
        "Event cancelled",
        "An event you registered for was cancelled.",
        under("/events", "eventId")
      );
    case "event.registered":
      return copy(
        "Registration confirmed",
        "Your event registration is confirmed.",
        under("/events", "eventId")
      );
    case "message.sent":
      return copy(
        "New message",
        "You have a new message.",
        under("/messages", "conversationId")
      );
    case "comment.created":
      return copy(
        "New comment",
        "Someone commented on a post you're following.",
        under("/feed", "postId")
      );
    case "achievement.submitted":
      return copy(
        "Achievement awaiting review",
        "An achievement was submitted and is awaiting review.",
        "/achievements"
      );
    case "achievement.approved":
      return copy(
        "Achievement approved",
        "Your achievement was approved and published.",
        "/achievements"
      );
    case "achievement.rejected":
      return copy(
        "Achievement rejected",
        "Your achievement submission was not approved.",
        "/achievements"
      );
    case "report.filed":
      return copy(
        "New report to review",
        "A post or comment was reported and is awaiting review.",
        "/feed"
      );
    case "report.resolved":
      return copy(
        "Your report was reviewed",
        "A moderator reviewed content you reported.",
        "/feed"
      );
    case "content.removed":
      return copy(
        "Content removed",
        "One of your posts or comments was removed by a moderator.",
        "/feed"
      );
    case "verification.decided":
      return payload.decision === "APPROVED"
        ? copy(
            "Verification approved",
            "Your alumni verification was approved.",
            "/profile"
          )
        : payload.decision === "REJECTED"
          ? copy(
              "Verification not approved",
              "Your alumni verification request was not approved.",
              "/onboarding"
            )
          : copy(
              "Verification reviewed",
              "Your verification request was reviewed.",
              "/profile"
            );
    case "user.suspended":
      return copy(
        "Account suspended",
        "Your account has been suspended by an administrator.",
        "/account/status"
      );
    case "user.reactivated":
      return copy(
        "Account reinstated",
        "Your account has been reinstated. You can sign in again.",
        "/profile"
      );
    case "event.registration-cancelled":
      return copy(
        "Registration cancelled",
        "Your registration for an event was cancelled.",
        under("/events", "eventId")
      );
    default:
      throw new Error(`No notification copy for type "${type}".`);
  }
}
