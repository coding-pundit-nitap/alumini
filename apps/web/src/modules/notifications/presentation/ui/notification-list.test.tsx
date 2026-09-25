import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Bell, Briefcase, UserPlus } from "lucide-react";

import { dayLabel, iconFor, NotificationList } from "./notification-list";

describe("NotificationList", () => {
  it("renders items and calls mark-read on click", async () => {
    const onRead = vi.fn();
    render(
      <NotificationList
        items={[
          {
            id: "n1",
            type: "connection.requested",
            readAt: null,
            createdAt: new Date().toISOString(),
            payload: {},
          },
        ]}
        onRead={onRead}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /mark read/i }));
    expect(onRead).toHaveBeenCalledWith("n1");
  });

  it("does not show a mark-read button for an already-read item", () => {
    render(
      <NotificationList
        items={[
          {
            id: "n2",
            type: "event.reminder",
            readAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            payload: {},
          },
        ]}
        onRead={vi.fn()}
      />
    );
    expect(
      screen.queryByRole("button", { name: /mark read/i })
    ).not.toBeInTheDocument();
  });

  it("renders the readable title as a link to the target", () => {
    render(
      <NotificationList
        items={[
          {
            id: "n4",
            type: "comment.created",
            readAt: null,
            createdAt: new Date().toISOString(),
            payload: { postId: "p1" },
          },
        ]}
        onRead={vi.fn()}
      />
    );
    expect(screen.getByRole("link", { name: "New comment" })).toHaveAttribute(
      "href",
      "/feed/p1"
    );
    expect(
      screen.getByText("Someone commented on a post you're following.")
    ).toBeInTheDocument();
  });

  it("renders even when the notification's target content is gone (payload empty)", () => {
    render(
      <NotificationList
        items={[
          {
            id: "n3",
            type: "post.commented",
            readAt: null,
            createdAt: new Date().toISOString(),
            payload: {},
          },
        ]}
        onRead={vi.fn()}
      />
    );
    expect(
      screen.getByRole("link", { name: /post commented/i })
    ).toHaveAttribute("href", "/notifications");
  });

  it("shows an empty state with no items", () => {
    render(<NotificationList items={[]} onRead={vi.fn()} />);
    expect(screen.getByText(/no notifications/i)).toBeInTheDocument();
  });

  it("marks an unread item read when its link is followed, and leaves read ones alone", async () => {
    const onRead = vi.fn();
    const base = {
      type: "comment.created",
      createdAt: new Date().toISOString(),
      payload: { postId: "p1" },
    };
    render(
      <NotificationList
        items={[
          { ...base, id: "n1", readAt: null },
          { ...base, id: "n2", readAt: new Date().toISOString() },
        ]}
        onRead={onRead}
      />
    );
    const [unread, read] = screen.getAllByRole("link", { name: "New comment" });
    unread!.addEventListener("click", (e) => e.preventDefault());
    read!.addEventListener("click", (e) => e.preventDefault());
    await userEvent.click(unread!);
    await userEvent.click(read!);
    expect(onRead).toHaveBeenCalledTimes(1);
    expect(onRead).toHaveBeenCalledWith("n1");
  });

  it("groups by day under Today / Yesterday / a date heading", () => {
    const now = new Date();
    const days = (n: number) =>
      new Date(now.getTime() - n * 86_400_000).toISOString();
    render(
      <NotificationList
        items={["a", "b", "c"].map((id, i) => ({
          id,
          type: "job.published",
          readAt: null,
          createdAt: days(i === 2 ? 30 : i),
          payload: {},
        }))}
        onRead={vi.fn()}
      />
    );
    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);
    expect(headings.slice(0, 2)).toEqual(["Today", "Yesterday"]);
    expect(headings).toHaveLength(3);
  });

  it("labels days in IST, with the year only when it differs", () => {
    const now = new Date("2026-09-25T12:00:00Z");
    expect(dayLabel("2026-09-25T00:30:00Z", now)).toBe("Today");
    // 20:00 UTC on the 24th is already the 25th in IST.
    expect(dayLabel("2026-09-24T20:00:00Z", now)).toBe("Today");
    expect(dayLabel("2026-09-24T10:00:00Z", now)).toBe("Yesterday");
    expect(dayLabel("2026-09-12T10:00:00Z", now)).toBe("12 Sep");
    expect(dayLabel("2025-03-02T10:00:00Z", now)).toBe("2 Mar 2025");
  });

  it("picks an icon from the type's prefix, and a bell for unknown types", () => {
    expect(iconFor("connection.accepted")).toBe(UserPlus);
    expect(iconFor("job.expired")).toBe(Briefcase);
    expect(iconFor("something.new")).toBe(Bell);
  });
});
