import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ActionResult } from "@/lib/action-result";

import {
  render,
  screen,
  waitFor,
} from "../../../../../tests/support/test-utils";
import { PrivacyForm } from "./privacy-form";

const optionFor = (select: HTMLElement, text: RegExp) =>
  Array.from(select.querySelectorAll("option")).find((o) =>
    text.test(o.textContent ?? "")
  ) as HTMLOptionElement;

type Action = (formData: FormData) => Promise<ActionResult<{ saved: true }>>;

describe("PrivacyForm", () => {
  it("disables location options looser than the profile level", () => {
    render(
      <PrivacyForm
        action={vi.fn()}
        defaults={{ visibility: "PRIVATE", location: null }}
      />
    );
    const location = screen.getByLabelText("Who can see your location");
    expect(optionFor(location, /^Everyone/).disabled).toBe(true);
    expect(optionFor(location, /^Verified members/).disabled).toBe(true);
    expect(optionFor(location, /^Only me/).disabled).toBe(false);
  });

  it("resets a now-looser location override when the profile level is tightened", async () => {
    const user = userEvent.setup();
    render(
      <PrivacyForm
        action={vi.fn()}
        defaults={{ visibility: "PUBLIC", location: "PUBLIC" }}
      />
    );
    await user.selectOptions(
      screen.getByLabelText("Who can see your profile"),
      "PRIVATE"
    );
    expect(screen.getByLabelText("Who can see your location")).toHaveValue(
      "INHERIT"
    );
  });

  it("submits the chosen level and override and shows a saved message", async () => {
    const action = vi.fn<Action>(async () => ({
      ok: true,
      data: { saved: true },
    }));
    const user = userEvent.setup();
    render(
      <PrivacyForm
        action={action}
        defaults={{ visibility: "MEMBERS_ONLY", location: null }}
      />
    );
    await user.selectOptions(
      screen.getByLabelText("Who can see your location"),
      "PRIVATE"
    );
    await user.click(
      screen.getByRole("button", { name: "Save privacy settings" })
    );

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    const sent = action.mock.calls[0]![0];
    expect(sent.get("visibility")).toBe("MEMBERS_ONLY");
    expect(sent.get("location")).toBe("PRIVATE");
    expect(
      await screen.findByText("Privacy settings saved.")
    ).toBeInTheDocument();
  });

  it("shows the field error the action returns", async () => {
    const action = vi.fn<Action>(async () => ({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "The request contains invalid fields.",
        fields: {
          location: "Choose the same level as your profile, or a stricter one.",
        },
      },
      requestId: "r",
    }));
    const user = userEvent.setup();
    render(
      <PrivacyForm
        action={action}
        defaults={{ visibility: "MEMBERS_ONLY", location: null }}
      />
    );
    await user.click(
      screen.getByRole("button", { name: "Save privacy settings" })
    );
    expect(
      await screen.findByText(/same level as your profile, or a stricter one/)
    ).toBeInTheDocument();
  });
});
