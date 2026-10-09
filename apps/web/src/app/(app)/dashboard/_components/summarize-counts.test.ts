import { describe, expect, it } from "vitest";

import type { Loaded } from "./load-block";
import { summarizeCounts } from "./summarize-counts";

const ok = (value: number): Loaded<number> => ({ status: "ok", value });
const absent: Loaded<number> = { status: "absent" };
const error: Loaded<number> = { status: "error" };

describe("summarizeCounts", () => {
  it("passes ok values through", () => {
    expect(
      summarizeCounts({
        connectionRequests: ok(2),
        unreadMessages: ok(3),
        mentorshipRequests: ok(1),
        unreadNotifications: ok(4),
      })
    ).toEqual({
      counts: {
        connectionRequests: 2,
        unreadMessages: 3,
        mentorshipRequests: 1,
        unreadNotifications: 4,
      },
      failed: false,
    });
  });

  it("treats an absent count as zero, not a failure", () => {
    const { counts, failed } = summarizeCounts({
      connectionRequests: absent,
      unreadMessages: ok(1),
      mentorshipRequests: ok(0),
      unreadNotifications: ok(0),
    });
    expect(counts.connectionRequests).toBe(0);
    expect(failed).toBe(false);
  });

  it("excludes an errored count from its tile and flags failed", () => {
    const { counts, failed } = summarizeCounts({
      connectionRequests: ok(2),
      unreadMessages: error,
      mentorshipRequests: ok(0),
      unreadNotifications: ok(0),
    });
    expect(counts.unreadMessages).toBe(0);
    expect(counts.connectionRequests).toBe(2);
    expect(failed).toBe(true);
  });

  it("caps unreadMessages at COUNT_CAP", () => {
    const { counts } = summarizeCounts({
      connectionRequests: ok(0),
      unreadMessages: ok(999),
      mentorshipRequests: ok(0),
      unreadNotifications: ok(0),
    });
    expect(counts.unreadMessages).toBe(50);
  });
});
