export type NotificationCopy = {
  title: string;
  body: string;
  actionPath: string;
};

/** One line of copy per notification type. Payload is ids-only, so copy never names people — it says
 * what happened generically; the in-app UI re-reads current state to show names (spec N-3). */
export function renderNotificationCopy(
  type: string,
  _payload: Record<string, unknown>
): NotificationCopy {
  switch (type) {
    case "connection.requested":
      return {
        title: "New connection request",
        body: "You have a new connection request.",
        actionPath: "/connections",
      };
    case "connection.accepted":
      return {
        title: "Connection accepted",
        body: "Someone accepted your connection request.",
        actionPath: "/connections",
      };
    case "mentorship.requested":
      return {
        title: "New mentorship request",
        body: "A student has requested mentorship.",
        actionPath: "/mentorship",
      };
    case "mentorship.accepted":
      return {
        title: "Mentorship accepted",
        body: "Your mentorship request was accepted.",
        actionPath: "/mentorship",
      };
    case "job.submitted":
      return {
        title: "New job posting needs review",
        body: "A job posting was submitted and is awaiting review.",
        actionPath: "/jobs",
      };
    case "job.published":
      return {
        title: "Your job posting is live",
        body: "Your job posting was approved and published.",
        actionPath: "/jobs",
      };
    case "job.rejected":
      return {
        title: "Your job posting was rejected",
        body: "Your job posting was not approved.",
        actionPath: "/jobs",
      };
    case "job.closed":
      return {
        title: "Your job posting was closed",
        body: "Your job posting is now closed.",
        actionPath: "/jobs",
      };
    case "event.cancelled":
      return {
        title: "Event cancelled",
        body: "An event you registered for was cancelled.",
        actionPath: "/events",
      };
    case "event.registered":
      return {
        title: "Registration confirmed",
        body: "Your event registration is confirmed.",
        actionPath: "/events",
      };
    case "message.sent":
      return {
        title: "New message",
        body: "You have a new message.",
        actionPath: "/messages",
      };
    case "comment.created":
      return {
        title: "New comment",
        body: "Someone commented on a post you're following.",
        actionPath: "/feed",
      };
    case "achievement.approved":
      return {
        title: "Achievement approved",
        body: "Your achievement was approved and published.",
        actionPath: "/achievements",
      };
    case "achievement.rejected":
      return {
        title: "Achievement rejected",
        body: "Your achievement submission was not approved.",
        actionPath: "/achievements",
      };
    case "content.removed":
      return {
        title: "Content removed",
        body: "One of your posts or comments was removed by a moderator.",
        actionPath: "/feed",
      };
    default:
      throw new Error(`No notification copy for type "${type}".`);
  }
}
