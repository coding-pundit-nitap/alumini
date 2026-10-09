import { describe, expect, it } from "vitest";

import { renderNotificationCopy } from "./copy.ts";

/** Every catalogue type that writes a notification, in-app-only ones included. */
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
  "verification.decided",
  "user.suspended",
  "user.reactivated",
  "event.registration-cancelled",
  "donation.pledged",
  "donation.confirmed",
  "donation.not-received",
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

  it("verification.decided copy follows the decision, with a neutral fallback", () => {
    expect(
      renderNotificationCopy("verification.decided", { decision: "APPROVED" })
    ).toEqual({
      title: "Verification approved",
      body: "Your alumni verification was approved.",
      actionPath: "/profile",
    });
    expect(
      renderNotificationCopy("verification.decided", { decision: "REJECTED" })
    ).toEqual({
      title: "Verification not approved",
      body: "Your alumni verification request was not approved.",
      actionPath: "/onboarding",
    });
    expect(renderNotificationCopy("verification.decided", {}).title).toBe(
      "Verification reviewed"
    );
  });

  it("account and registration copy", () => {
    expect(renderNotificationCopy("user.suspended", {})).toEqual({
      title: "Account suspended",
      body: "Your account has been suspended by an administrator.",
      actionPath: "/account/status",
    });
    expect(renderNotificationCopy("user.reactivated", {})).toEqual({
      title: "Account reinstated",
      body: "Your account has been reinstated. You can sign in again.",
      actionPath: "/profile",
    });
    expect(
      renderNotificationCopy("event.registration-cancelled", {
        eventId: "3f1c0a52-0000-4000-8000-000000000001",
      }).actionPath
    ).toBe("/events/3f1c0a52-0000-4000-8000-000000000001");
  });

  it("throws on an unknown type rather than sending a blank email", () => {
    expect(() => renderNotificationCopy("nonsense.event", {})).toThrow();
  });

  it("announcement.published links to the post", () => {
    expect(
      renderNotificationCopy("announcement.published", {
        postId: "11111111-1111-4111-8111-111111111111",
      })
    ).toEqual({
      title: "New announcement",
      body: "The institute published an announcement.",
      actionPath: "/feed/11111111-1111-4111-8111-111111111111",
    });
  });
});
