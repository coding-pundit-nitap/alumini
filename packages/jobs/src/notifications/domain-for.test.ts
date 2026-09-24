import { describe, expect, it } from "vitest";
import { domainFor } from "./domain-for.ts";

describe("domainFor", () => {
  it("maps every catalogued event type to its preferences domain", () => {
    expect(domainFor("connection.requested")).toBe("CONNECTION");
    expect(domainFor("mentorship.accepted")).toBe("MENTORSHIP");
    expect(domainFor("job.published")).toBe("JOB");
    expect(domainFor("event.cancelled")).toBe("EVENT");
    expect(domainFor("event.registration-cancelled")).toBe("EVENT");
    expect(domainFor("message.sent")).toBe("MESSAGE");
    expect(domainFor("comment.created")).toBe("POST");
    expect(domainFor("achievement.approved")).toBe("ACHIEVEMENT");
    expect(domainFor("report.filed")).toBe("MODERATION");
    expect(domainFor("content.removed")).toBe("MODERATION");
  });

  it("throws on an unmapped type rather than silently defaulting", () => {
    expect(() => domainFor("nonsense.event")).toThrow();
  });
});
