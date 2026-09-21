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

const inherit = {
  contact: null,
  location: null,
  experience: null,
  education: null,
};

describe("PrivacyForm", () => {
  it("disables location options looser than the profile level", () => {
    render(
      <PrivacyForm
        action={vi.fn()}
        defaults={{ visibility: "PRIVATE", ...inherit }}
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
        defaults={{ visibility: "PUBLIC", ...inherit, location: "PUBLIC" }}
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

  it("also resets a now-looser contest override, independently of location", async () => {
    const user = userEvent.setup();
    render(
      <PrivacyForm
        action={vi.fn()}
        defaults={{
          visibility: "PUBLIC",
          ...inherit,
          contact: "MEMBERS_ONLY",
          location: "PRIVATE",
        }}
      />
    );
    await user.selectOptions(
      screen.getByLabelText("Who can see your profile"),
      "MEMBERS_ONLY"
    );
    // location (PRIVATE) is still allowed at MEMBERS_ONLY; contact (MEMBERS_ONLY) is unaffected.
    expect(screen.getByLabelText("Who can see your location")).toHaveValue(
      "PRIVATE"
    );
    expect(
      screen.getByLabelText("Who can see your contact details")
    ).toHaveValue("MEMBERS_ONLY");

    await user.selectOptions(
      screen.getByLabelText("Who can see your profile"),
      "PRIVATE"
    );
    expect(
      screen.getByLabelText("Who can see your contact details")
    ).toHaveValue("INHERIT");
  });

  it("submits the level and all four overrides, and shows a saved message", async () => {
    const action = vi.fn<Action>(async () => ({
      ok: true,
      data: { saved: true },
    }));
    const user = userEvent.setup();
    render(
      <PrivacyForm
        action={action}
        defaults={{ visibility: "MEMBERS_ONLY", ...inherit }}
      />
    );
    await user.selectOptions(
      screen.getByLabelText("Who can see your location"),
      "PRIVATE"
    );
    await user.selectOptions(
      screen.getByLabelText("Who can see your work experience and skills"),
      "MEMBERS_ONLY"
    );
    await user.click(
      screen.getByRole("button", { name: "Save privacy settings" })
    );

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    const sent = action.mock.calls[0]![0];
    expect(sent.get("visibility")).toBe("MEMBERS_ONLY");
    expect(sent.get("location")).toBe("PRIVATE");
    expect(sent.get("experience")).toBe("MEMBERS_ONLY");
    expect(sent.get("contact")).toBe("INHERIT");
    expect(sent.get("education")).toBe("INHERIT");
    expect(
      await screen.findByText("Privacy settings saved.")
    ).toBeInTheDocument();
  });

  it("shows the field error the action returns, on the right section", async () => {
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
        defaults={{ visibility: "MEMBERS_ONLY", ...inherit }}
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
