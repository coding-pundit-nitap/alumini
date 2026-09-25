import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { render, screen } from "../../../../../tests/support/test-utils";
import { AchievementList } from "./achievement-list";

const achievement = () => ({
  id: "11111111-1111-4111-8111-111111111111",
  userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  title: "Best Paper",
  description: "Won at the conference",
  category: "AWARD",
  status: "SUBMITTED" as const,
  reviewedById: null,
  publishedPostId: null,
  createdAt: new Date("2026-01-01"),
});

const achievements = [achievement()];

describe("AchievementList", () => {
  it("renders each achievement's title and status badge", () => {
    render(<AchievementList achievements={achievements} isReviewer={false} />);
    expect(screen.getByText("Best Paper")).toBeInTheDocument();
    expect(screen.getByText("SUBMITTED")).toBeInTheDocument();
  });

  it("hides the approve/reject affordance from a non-reviewer", () => {
    render(<AchievementList achievements={achievements} isReviewer={false} />);
    expect(screen.queryByRole("button", { name: /approve/i })).toBeNull();
  });

  it("shows approve/reject to a reviewer and calls onReview with the outcome after confirming", async () => {
    const onReview = vi.fn(async () => ({ ok: true as const, data: {} }));
    render(
      <AchievementList
        achievements={achievements}
        isReviewer={true}
        onReview={onReview}
      />
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^approve$/i }));
    await user.click(
      screen.getByRole("button", { name: "Approve achievement" })
    );
    expect(onReview).toHaveBeenCalledWith(achievements[0]!.id, "approve");

    await user.click(screen.getByRole("button", { name: /^reject$/i }));
    await user.click(
      screen.getByRole("button", { name: "Reject achievement" })
    );
    expect(onReview).toHaveBeenCalledWith(achievements[0]!.id, "reject");
  });

  it("shows who submitted it, confirms before deciding, and shows a failure", async () => {
    const user = userEvent.setup();
    const onReview = vi.fn(async () => ({
      ok: false as const,
      error: { code: "X", message: "Already reviewed." },
      requestId: "r",
    }));
    render(
      <AchievementList
        achievements={[
          { ...achievement(), owner: { id: "u9", name: "Asha Rao" } },
        ]}
        isReviewer
        onReview={onReview}
      />
    );
    expect(screen.getByText(/Asha Rao/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^approve$/i }));
    expect(onReview).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "Approve achievement" })
    );
    expect(onReview).toHaveBeenCalledWith(expect.any(String), "approve");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Already reviewed."
    );
  });
});
