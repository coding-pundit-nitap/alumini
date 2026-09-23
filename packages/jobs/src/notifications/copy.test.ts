import { describe, expect, it } from "vitest";

import { renderNotificationCopy } from "./copy.ts";

describe("renderNotificationCopy", () => {
  it("renders connection.requested", () => {
    const result = renderNotificationCopy("connection.requested", {
      connectionId: "c1",
    });
    expect(result.title).toBe("New connection request");
    expect(result.actionPath).toBe("/connections");
  });

  it("renders job.submitted", () => {
    const result = renderNotificationCopy("job.submitted", { jobId: "j1" });
    expect(result.title).toBe("New job posting needs review");
    expect(result.actionPath).toBe("/jobs");
  });

  it("renders job.closed", () => {
    const result = renderNotificationCopy("job.closed", { jobId: "j1" });
    expect(result.title).toBe("Your job posting was closed");
    expect(result.actionPath).toBe("/jobs");
  });

  it("throws on an unknown type rather than sending a blank email", () => {
    expect(() => renderNotificationCopy("nonsense.event", {})).toThrow();
  });
});
