import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  render,
  screen,
  within,
} from "../../../../../tests/support/test-utils";
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
    expect(screen.getByText("Awaiting review")).toBeInTheDocument();
    expect(screen.getByText(/Award ·/)).toBeInTheDocument();
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

  it("lets the owner withdraw a submission after confirming", async () => {
    const user = userEvent.setup();
    const onWithdraw = vi.fn(async () => ({ ok: true as const, data: {} }));
    render(
      <AchievementList
        achievements={achievements}
        isReviewer={false}
        onWithdraw={onWithdraw}
      />
    );
    await user.click(screen.getByRole("button", { name: "Withdraw" }));
    await user.click(screen.getByRole("button", { name: "Keep it" }));
    expect(onWithdraw).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Withdraw" }));
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Withdraw",
      })
    );
    expect(onWithdraw).toHaveBeenCalledWith(achievements[0]!.id);
  });

  it("links a published achievement to its post and offers no withdraw", () => {
    render(
      <AchievementList
        achievements={[
          {
            ...achievement(),
            status: "PUBLISHED" as const,
            publishedPostId: "p1",
          },
        ]}
        isReviewer={false}
        onWithdraw={vi.fn()}
      />
    );
    expect(screen.getByText("Published")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View post/ })).toHaveAttribute(
      "href",
      "/feed/p1"
    );
    expect(screen.queryByRole("button", { name: "Withdraw" })).toBeNull();
  });
});
