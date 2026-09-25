import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { render, screen } from "../../../../../tests/support/test-utils";
import { AchievementForm } from "./achievement-form";

function actions() {
  return {
    onSubmit: vi.fn(async () => ({
      ok: true as const,
      data: { achievementId: "a1" },
    })),
  };
}

describe("AchievementForm", () => {
  it("disables submit until title and description are filled", async () => {
    render(<AchievementForm {...actions()} />);
    expect(screen.getByRole("button", { name: /submit/i })).toBeDisabled();
  });

  it("submits the parsed input shape", async () => {
    const a = actions();
    render(<AchievementForm {...a} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/title/i), "Best Paper Award");
    await user.type(
      screen.getByLabelText(/description/i),
      "Won at the conference"
    );
    await user.click(screen.getByRole("radio", { name: "Publication" }));
    await user.click(screen.getByRole("button", { name: /submit/i }));
    expect(a.onSubmit).toHaveBeenCalledWith({
      title: "Best Paper Award",
      description: "Won at the conference",
      category: "PUBLICATION",
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Submitted");
  });
});
