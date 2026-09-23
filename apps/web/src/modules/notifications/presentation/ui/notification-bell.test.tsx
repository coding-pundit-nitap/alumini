import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NotificationBell } from "./notification-bell";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("NotificationBell", () => {
  it("shows the unread count badge from the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("unread-count")) {
          return new Response(JSON.stringify({ data: { count: 3 } }), {
            status: 200,
          });
        }
        return new Response(
          JSON.stringify({ data: [], page: { nextCursor: null } }),
          { status: 200 }
        );
      })
    );
    render(<NotificationBell />);
    await waitFor(() => expect(screen.getByText("3")).toBeInTheDocument());
  });

  it("hides the badge at zero unread", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("unread-count")) {
          return new Response(JSON.stringify({ data: { count: 0 } }), {
            status: 200,
          });
        }
        return new Response(
          JSON.stringify({ data: [], page: { nextCursor: null } }),
          { status: 200 }
        );
      })
    );
    render(<NotificationBell />);
    await waitFor(() =>
      expect(screen.queryByTestId("unread-badge")).not.toBeInTheDocument()
    );
  });

  it("marks an unread item read on click, without navigating, and reflects it in the badge", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("unread-count")) {
        return new Response(JSON.stringify({ data: { count: 1 } }), {
          status: 200,
        });
      }
      if (url.endsWith("/read") && init?.method === "POST") {
        return new Response(null, { status: 200 });
      }
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "n1",
              type: "connection.accepted",
              readAt: null,
              createdAt: new Date().toISOString(),
            },
          ],
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<NotificationBell />);
    await waitFor(() => expect(screen.getByText("1")).toBeInTheDocument());

    await userEvent.click(
      screen.getByRole("button", { name: "Notifications" })
    );
    const item = await screen.findByText("connection accepted");
    await userEvent.click(item);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/notifications/n1/read",
        expect.objectContaining({ method: "POST" })
      )
    );
    await waitFor(() =>
      expect(screen.queryByTestId("unread-badge")).not.toBeInTheDocument()
    );
  });

  it("renders a read item as plain text and does not re-mark it on click", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("unread-count")) {
        return new Response(JSON.stringify({ data: { count: 0 } }), {
          status: 200,
        });
      }
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "n1",
              type: "connection.accepted",
              readAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
            },
          ],
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<NotificationBell />);
    await userEvent.click(
      screen.getByRole("button", { name: "Notifications" })
    );
    const item = await screen.findByText("connection accepted");
    fetchMock.mockClear();
    await userEvent.click(item);

    expect(
      fetchMock.mock.calls.some(([url]) => String(url).endsWith("/read"))
    ).toBe(false);
  });

  it('shows "View all notifications" as a link to /notifications', async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(JSON.stringify({ data: [] }), { status: 200 })
      )
    );
    render(<NotificationBell />);
    await userEvent.click(
      screen.getByRole("button", { name: "Notifications" })
    );
    const link = await screen.findByRole("menuitem", {
      name: "View all notifications",
    });
    expect(link).toHaveAttribute("href", "/notifications");
  });

  it("does not crash when the SSE stream and fetches fail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );
    expect(() => render(<NotificationBell />)).not.toThrow();
    await waitFor(() =>
      expect(screen.queryByTestId("unread-badge")).not.toBeInTheDocument()
    );
  });
});
