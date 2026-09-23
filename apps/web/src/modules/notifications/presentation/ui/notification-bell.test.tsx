import { render, screen, waitFor } from "@testing-library/react";
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
