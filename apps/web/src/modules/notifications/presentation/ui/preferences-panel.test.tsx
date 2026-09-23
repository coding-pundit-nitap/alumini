import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PreferencesPanel } from "./preferences-panel";

const ok = (status = 204) => Promise.resolve(new Response(null, { status }));
const fail = (body: unknown, status = 500) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PreferencesPanel", () => {
  it("toggling a preference sends the PATCH", async () => {
    const fetchMock = vi.fn(async () => ok());
    vi.stubGlobal("fetch", fetchMock);
    render(
      <PreferencesPanel
        initialPreferences={[{ domain: "CONNECTION", email: true }]}
      />
    );
    await userEvent.click(screen.getByRole("switch", { name: /connection/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/notifications/preferences",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ domain: "CONNECTION", enabled: false }),
        })
      )
    );
  });

  it("reverts and shows an error when the PATCH fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => fail({ error: { message: "Nope" } }))
    );
    render(
      <PreferencesPanel
        initialPreferences={[{ domain: "CONNECTION", email: true }]}
      />
    );
    const toggle = screen.getByRole("switch", { name: /connection/i });
    await userEvent.click(toggle);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/nope/i)
    );
    await waitFor(() => expect(toggle).toBeChecked());
  });

  it("disables a toggle while its PATCH is in flight and ignores a second click until it resolves", async () => {
    let resolveConnection!: (response: Response) => void;
    const pendingConnection = new Promise<Response>((resolve) => {
      resolveConnection = resolve;
    });
    const fetchMock = vi.fn(async () => pendingConnection);
    vi.stubGlobal("fetch", fetchMock);
    render(
      <PreferencesPanel
        initialPreferences={[{ domain: "CONNECTION", email: true }]}
      />
    );
    const toggle = screen.getByRole("switch", { name: /connection/i });

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-disabled", "true");

    // Before the first PATCH resolves, a second click on the same domain must not send another
    // request or race the eventual revert/settle against a value captured mid-flight.
    await userEvent.click(toggle);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveConnection(await ok());
    await waitFor(() =>
      expect(toggle).not.toHaveAttribute("aria-disabled", "true")
    );
    expect(toggle).not.toBeChecked();
  });

  it("a failed PATCH reverts only that domain, not a concurrent success", async () => {
    let resolveConnection!: (response: Response) => void;
    const pendingConnection = new Promise<Response>((resolve) => {
      resolveConnection = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { domain: string };
        if (body.domain === "CONNECTION") return pendingConnection;
        return ok();
      })
    );
    render(
      <PreferencesPanel
        initialPreferences={[
          { domain: "CONNECTION", email: true },
          { domain: "EVENT", email: true },
        ]}
      />
    );

    const connectionToggle = screen.getByRole("switch", {
      name: /connection/i,
    });
    const eventToggle = screen.getByRole("switch", { name: /event/i });
    // CONNECTION's PATCH is still in flight when EVENT's is sent and succeeds.
    await userEvent.click(connectionToggle);
    await userEvent.click(eventToggle);
    await waitFor(() => expect(eventToggle).not.toBeChecked());

    // CONNECTION's PATCH now fails.
    resolveConnection(
      new Response(JSON.stringify({ error: { message: "Nope" } }), {
        status: 500,
      })
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/nope/i)
    );
    // CONNECTION reverts to checked; EVENT's successful toggle must survive the rollback.
    await waitFor(() => expect(connectionToggle).toBeChecked());
    expect(eventToggle).not.toBeChecked();
  });
});
