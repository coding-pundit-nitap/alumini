import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { render, screen } from "../../../../../tests/support/test-utils";
import type { MentorProfileRecord } from "../../application/mentor-ports";
import { MentorSettingsForm } from "./mentor-settings-form";

const defaults = (
  over: Partial<MentorProfileRecord> = {}
): MentorProfileRecord => ({
  userId: "u1",
  expertise: "Backend systems",
  topics: ["career switching", "system design"],
  availability: "Weeknights",
  preferredContactMethod: "EMAIL",
  maxMentees: 5,
  accepting: true,
  ...over,
});

const ok = async () => ({ ok: true as const, data: { saved: true as const } });

function setup(over: Partial<Parameters<typeof MentorSettingsForm>[0]> = {}) {
  const props = {
    defaults: null,
    listedNote: null,
    saveAction: vi.fn(ok),
    ...over,
  };
  render(<MentorSettingsForm {...props} />);
  return props;
}

describe("MentorSettingsForm", () => {
  it("renders the caller's existing offer as defaults", () => {
    setup({ defaults: defaults() });
    expect(screen.getByLabelText("Expertise")).toHaveValue("Backend systems");
    expect(screen.getByLabelText("Topics")).toHaveValue(
      "career switching, system design"
    );
    expect(screen.getByLabelText("Availability")).toHaveValue("Weeknights");
    expect(screen.getByLabelText("Preferred contact method")).toHaveValue(
      "EMAIL"
    );
    expect(screen.getByLabelText("Maximum mentees")).toHaveValue(5);
    expect(
      screen.getByRole("checkbox", { name: "Not accepting new mentees" })
    ).not.toBeChecked();
  });

  it("shows the profile-visibility hint when listedNote is set", () => {
    setup({ listedNote: "Your profile is private, so you are not listed." });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Your profile is private, so you are not listed."
    );
  });

  it("submits the typed fields, splitting the comma-separated topics", async () => {
    const props = setup();
    await userEvent.type(
      screen.getByLabelText("Expertise"),
      "Product management"
    );
    await userEvent.type(
      screen.getByLabelText("Topics"),
      "resumes, interviews"
    );
    await userEvent.type(screen.getByLabelText("Availability"), "Weekends");
    await userEvent.selectOptions(
      screen.getByLabelText("Preferred contact method"),
      "VIDEO_CALL"
    );
    await userEvent.clear(screen.getByLabelText("Maximum mentees"));
    await userEvent.type(screen.getByLabelText("Maximum mentees"), "7");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(props.saveAction).toHaveBeenCalledWith({
      expertise: "Product management",
      topics: ["resumes", "interviews"],
      availability: "Weekends",
      preferredContactMethod: "VIDEO_CALL",
      maxMentees: 7,
      accepting: true,
    });
  });

  it("the 'Not accepting new mentees' checkbox maps to accepting: false", async () => {
    const props = setup({ defaults: defaults() });
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Not accepting new mentees" })
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(props.saveAction).toHaveBeenCalledWith(
      expect.objectContaining({ accepting: false })
    );
  });

  it("shows 'Saved.' once the action succeeds", async () => {
    setup();
    await userEvent.type(screen.getByLabelText("Expertise"), "Design");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
  });

  it("shows the server's error message when the action fails", async () => {
    setup({
      saveAction: vi.fn(async () => ({
        ok: false as const,
        error: { code: "VALIDATION_FAILED", message: "Expertise is required." },
        requestId: "r",
      })),
    });
    await userEvent.type(screen.getByLabelText("Expertise"), "Design");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Expertise is required."
    );
  });
});
