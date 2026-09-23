import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { NotificationList } from "./notification-list";

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
    expect(screen.getByText(/post commented/i)).toBeInTheDocument();
  });

  it("shows an empty state with no items", () => {
    render(<NotificationList items={[]} onRead={vi.fn()} />);
    expect(screen.getByText(/no notifications/i)).toBeInTheDocument();
  });
});
