import { describe, expect, it } from "vitest";

import { renderNotificationCopy } from "./copy.ts";

/** Every catalogue type that writes a notification (spec N-2), in-app-only ones included. */
const NOTIFYING_TYPES = [
  "connection.requested",
  "connection.accepted",
  "mentorship.requested",
  "mentorship.accepted",
  "mentorship.declined",
  "mentorship.cancelled",
  "mentorship.started",
  "mentorship.completed",
  "job.submitted",
  "job.published",
  "job.rejected",
  "job.closed",
  "job.expired",
  "event.cancelled",
  "event.registered",
  "message.sent",
  "comment.created",
  "achievement.submitted",
  "achievement.approved",
  "achievement.rejected",
  "report.filed",
  "report.resolved",
  "content.removed",
];

describe("renderNotificationCopy", () => {
  it.each(NOTIFYING_TYPES)(
    "has a title, body and in-app path for %s, even with an empty payload",
    (type) => {
      const copy = renderNotificationCopy(type, {});
      expect(copy.title).not.toBe("");
      expect(copy.body).not.toBe("");
      expect(copy.actionPath).toMatch(/^\/[a-z]/);
    }
  );

  it("renders connection.requested", () => {
    const result = renderNotificationCopy("connection.requested", {
      connectionId: "c1",
    });
    expect(result.title).toBe("New connection request");
    expect(result.actionPath).toBe("/connections");
  });

  it("links to the target when the payload carries its id, else to the list", () => {
    expect(
      renderNotificationCopy("event.cancelled", { eventId: "e1" }).actionPath
    ).toBe("/events/e1");
    expect(renderNotificationCopy("event.cancelled", {}).actionPath).toBe(
      "/events"
    );
    expect(
      renderNotificationCopy("message.sent", { conversationId: "c1" })
        .actionPath
    ).toBe("/messages/c1");
    expect(
      renderNotificationCopy("comment.created", { postId: "p1" }).actionPath
    ).toBe("/feed/p1");
    expect(
      renderNotificationCopy("job.submitted", { jobId: "j1" }).actionPath
    ).toBe("/jobs/moderation");
  });

  it("never builds a path from a non-id payload value", () => {
    expect(
      renderNotificationCopy("event.cancelled", { eventId: "../admin" })
        .actionPath
    ).toBe("/events");
  });

  it("throws on an unknown type rather than sending a blank email", () => {
    expect(() => renderNotificationCopy("nonsense.event", {})).toThrow();
  });
});
