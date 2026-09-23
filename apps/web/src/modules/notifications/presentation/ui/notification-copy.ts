import {
  renderNotificationCopy,
  type NotificationCopy,
} from "@nitap/jobs/notification-copy";

/** The shared copy, or a readable fallback for a type without copy (e.g. a row from an older release). */
export function notificationCopy(
  type: string,
  payload: Record<string, unknown> = {}
): NotificationCopy {
  try {
    return renderNotificationCopy(type, payload);
  } catch {
    const words = type.replace(/[._-]/g, " ");
    return {
      title: words.charAt(0).toUpperCase() + words.slice(1),
      body: "",
      actionPath: "/notifications",
    };
  }
}
