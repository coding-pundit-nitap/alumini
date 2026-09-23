import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  render,
  screen,
  waitFor,
} from "../../../../../tests/support/test-utils";
import { JobForm } from "./job-form";

describe("JobForm", () => {
  it("submits the filled fields, coercing deadline to a plain date string", async () => {
    const submitAction = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        data: { jobId: "job-1", status: "PENDING_REVIEW" },
      });
    render(<JobForm submitAction={submitAction} submitLabel="Post job" />);

    await userEvent.type(screen.getByLabelText("Title"), "Backend Engineer");
    await userEvent.type(screen.getByLabelText("Company"), "Acme");
    await userEvent.type(screen.getByLabelText("Description"), "Build things");
    await userEvent.type(screen.getByLabelText("Location"), "Remote");
    await userEvent.type(screen.getByLabelText("Experience"), "2+ years");
    await userEvent.type(
      screen.getByLabelText("Application link"),
      "https://acme.example/apply"
    );
    await userEvent.type(screen.getByLabelText("Deadline"), "2026-12-01");
    await userEvent.click(screen.getByRole("button", { name: "Post job" }));

    await waitFor(() => expect(submitAction).toHaveBeenCalled());
    expect(submitAction.mock.calls[0]![0]).toMatchObject({
      title: "Backend Engineer",
      company: "Acme",
      description: "Build things",
      location: "Remote",
      experience: "2+ years",
      applicationUrl: "https://acme.example/apply",
      deadline: "2026-12-01",
      employmentType: "FULL_TIME",
      workMode: "ONSITE",
      skills: [],
    });
  });

  it("shows the safe error message on failure", async () => {
    const submitAction = vi.fn().mockResolvedValue({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "The request contains invalid fields.",
      },
      requestId: "r",
    });
    render(<JobForm submitAction={submitAction} submitLabel="Post job" />);
    await userEvent.type(screen.getByLabelText("Title"), "Backend Engineer");
    await userEvent.type(screen.getByLabelText("Company"), "Acme");
    await userEvent.type(screen.getByLabelText("Description"), "Build things");
    await userEvent.type(screen.getByLabelText("Location"), "Remote");
    await userEvent.type(screen.getByLabelText("Experience"), "2+ years");
    await userEvent.type(
      screen.getByLabelText("Application link"),
      "https://acme.example/apply"
    );
    await userEvent.type(screen.getByLabelText("Deadline"), "2026-12-01");
    await userEvent.click(screen.getByRole("button", { name: "Post job" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("invalid fields")
    );
  });
});
