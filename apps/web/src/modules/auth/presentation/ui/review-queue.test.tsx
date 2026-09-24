import { describe, expect, it, vi } from "vitest";

import { render, screen } from "../../../../../tests/support/test-utils";
import type { PendingPage } from "../../application/list-pending-verification-requests";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

import { ReviewQueue } from "./review-queue";

const item = (n: number) => ({
  id: `11111111-1111-4111-8111-11111111111${n}`,
  userId: `u${n}`,
  submittedAt: new Date("2026-09-20T10:00:00Z"),
  applicantName: `Applicant ${n}`,
  applicantEmail: `a${n}@gmail.test`,
  rollNumber: `ROLL-${n}`,
  departmentName: "Computer Science",
  degreeName: "B.Tech",
  graduationYear: 2019,
  supportingInfo: n === 1 ? "Batch of 2019" : null,
  crossCheck: "NOT_CHECKED" as const,
  history: [],
});

const action = vi.fn();

describe("ReviewQueue", () => {
  it("shows an empty state", () => {
    render(
      <ReviewQueue
        page={{ items: [], nextCursor: null }}
        action={action}
        nextHref={null}
      />
    );
    expect(screen.getByText(/no requests are waiting/i)).toBeInTheDocument();
  });

  it("lists each request with its evidence and cross-check, findable by roll number", () => {
    const page: PendingPage = { items: [item(1), item(2)], nextCursor: null };
    render(<ReviewQueue page={page} action={action} nextHref={null} />);

    const first = screen.getByTestId("request-ROLL-1");
    expect(first).toHaveTextContent("Applicant 1");
    expect(first).toHaveTextContent("a1@gmail.test");
    expect(first).toHaveTextContent("Batch of 2019");
    expect(first).toHaveTextContent(/not checked/i);
    expect(screen.getByTestId("request-ROLL-2")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Approve" })).toHaveLength(2);
  });

  it("links to the next page when there is one", () => {
    render(
      <ReviewQueue
        page={{ items: [item(1)], nextCursor: "abc" }}
        action={action}
        nextHref="/admin/verification?cursor=abc"
      />
    );
    expect(screen.getByRole("link", { name: /next/i })).toHaveAttribute(
      "href",
      "/admin/verification?cursor=abc"
    );
  });

  it("shows earlier rejections with their notes", () => {
    const page: PendingPage = {
      items: [
        {
          ...item(1),
          history: [
            {
              status: "REJECTED",
              decidedAt: new Date("2026-09-01T00:00:00Z"),
              note: "Roll number mismatch",
            },
            {
              status: "REJECTED",
              decidedAt: new Date("2026-08-01T00:00:00Z"),
              note: null,
            },
          ],
        },
      ],
      nextCursor: null,
    };
    render(<ReviewQueue page={page} action={action} nextHref={null} />);
    const card = screen.getByTestId("request-ROLL-1");
    expect(card).toHaveTextContent("Previously rejected ×2");
    expect(card).toHaveTextContent("Roll number mismatch");
  });
});
