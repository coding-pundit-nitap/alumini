import { describe, expect, it, vi } from "vitest";

import { render, screen } from "../../../../../tests/support/test-utils";
import type { MentorCard } from "../../application/mentor-ports";
import { MentorList } from "./mentor-list";

type Mentor = Omit<MentorCard, "sortKey">;

const mentor = (over: Partial<Mentor> = {}): Mentor => ({
  userId: "u1",
  fullName: "Asha Rao",
  headline: "Staff engineer",
  department: "CSE",
  currentCompany: "Acme",
  hasPhoto: false,
  expertise: "Backend systems and distributed databases",
  topics: ["career switching", "system design"],
  availability: "Weeknights, 30 minutes",
  preferredContactMethod: "EMAIL",
  spotsLeft: 2,
  ...over,
});

describe("MentorList", () => {
  it("says something useful when no mentors match", () => {
    render(<MentorList items={[]} />);
    expect(screen.getByText("No mentors match yet.")).toBeInTheDocument();
  });

  it("shows how many spots are left, singular for one, nothing when full", () => {
    render(
      <MentorList
        items={[
          mentor({ userId: "a", spotsLeft: 1 }),
          mentor({ userId: "b", spotsLeft: 3 }),
          mentor({ userId: "c", spotsLeft: 0 }),
        ]}
      />
    );
    expect(screen.getByText("1 spot left")).toBeInTheDocument();
    expect(screen.getByText("3 spots left")).toBeInTheDocument();
    expect(screen.getAllByText(/spots? left/)).toHaveLength(2);
  });

  it("renders name, expertise, topics as chips and availability", () => {
    render(<MentorList items={[mentor()]} />);
    expect(screen.getByRole("link", { name: "Asha Rao" })).toHaveAttribute(
      "href",
      "/members/u1"
    );
    expect(
      screen.getByText("Backend systems and distributed databases")
    ).toBeInTheDocument();
    expect(screen.getByText("career switching")).toBeInTheDocument();
    expect(screen.getByText("system design")).toBeInTheDocument();
    expect(screen.getByText("Weeknights, 30 minutes")).toBeInTheDocument();
    expect(screen.getByText("CSE · Acme")).toBeInTheDocument();
  });

  it("renders requestSlot's output for each row", () => {
    const requestSlot = vi.fn((m: Mentor) => (
      <button key={m.userId}>Request {m.fullName}</button>
    ));
    render(
      <MentorList
        items={[mentor(), mentor({ userId: "u2", fullName: "Ben Lee" })]}
        requestSlot={requestSlot}
      />
    );
    expect(
      screen.getByRole("button", { name: "Request Asha Rao" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Request Ben Lee" })
    ).toBeInTheDocument();
    expect(requestSlot).toHaveBeenCalledTimes(2);
  });

  it("links each topic to a search for it", () => {
    render(<MentorList items={[mentor()]} />);
    expect(
      screen.getByRole("link", { name: "career switching" })
    ).toHaveAttribute("href", "/mentorship?tab=find&topic=career+switching");
  });
});
