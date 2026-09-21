import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ActionResult } from "@/lib/action-result";

import {
  render,
  screen,
  waitFor,
} from "../../../../../tests/support/test-utils";
import { ProfileForm } from "./profile-form";

const defaults = {
  fullName: "Asha Rao",
  headline: "Engineer",
  bio: null,
  location: null,
};

type Action = (formData: FormData) => Promise<ActionResult<{ saved: true }>>;

describe("ProfileForm", () => {
  it("prefills the four fields and offers no institutional field", () => {
    render(<ProfileForm action={vi.fn()} defaults={defaults} />);
    expect(screen.getByLabelText("Full name")).toHaveValue("Asha Rao");
    expect(screen.getByLabelText("Headline")).toHaveValue("Engineer");
    expect(
      screen.queryByLabelText(/department|degree|graduation|batch/i)
    ).toBeNull();
  });

  it("submits only the four named fields and shows a saved message", async () => {
    const action = vi.fn<Action>(async () => ({
      ok: true,
      data: { saved: true },
    }));
    const user = userEvent.setup();
    render(<ProfileForm action={action} defaults={defaults} />);

    await user.clear(screen.getByLabelText("Headline"));
    await user.type(screen.getByLabelText("Headline"), "Robotics engineer");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    const sent = action.mock.calls[0]![0];
    expect([...sent.keys()].sort()).toEqual([
      "bio",
      "fullName",
      "headline",
      "location",
    ]);
    expect(sent.get("headline")).toBe("Robotics engineer");
    expect(await screen.findByText("Profile saved.")).toBeInTheDocument();
  });

  it("shows the per-field error the action returns", async () => {
    const action = vi.fn<Action>(async () => ({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "The request contains invalid fields.",
        fields: { fullName: "Enter your name." },
      },
      requestId: "r",
    }));
    const user = userEvent.setup();
    render(<ProfileForm action={action} defaults={defaults} />);
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByText("Enter your name.")).toBeInTheDocument();
  });
});
