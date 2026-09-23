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
});
