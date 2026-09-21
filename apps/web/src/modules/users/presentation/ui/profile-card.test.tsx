import { describe, expect, it } from "vitest";

import { render, screen } from "../../../../../tests/support/test-utils";
import { ProfileCard } from "./profile-card";

describe("ProfileCard", () => {
  it("renders the reduced view: name and headline, no About or institution", () => {
    render(
      <ProfileCard
        view={{ userId: "u", fullName: "Asha Rao", headline: "Engineer" }}
      />
    );
    expect(
      screen.getByRole("heading", { name: "Asha Rao" })
    ).toBeInTheDocument();
    expect(screen.getByText("Engineer")).toBeInTheDocument();
    expect(screen.queryByText("About")).toBeNull();
    expect(screen.queryByText(/Batch of/)).toBeNull();
  });

  it("renders every section that is present", () => {
    render(
      <ProfileCard
        view={{
          userId: "u",
          fullName: "Asha Rao",
          headline: null,
          location: "Tirupati",
          bio: "Line one\nLine two",
          institution: {
            department: "Computer Science",
            degree: "B.Tech",
            graduationYear: 2019,
          },
        }}
      />
    );
    expect(screen.getByText("Tirupati")).toBeInTheDocument();
    expect(screen.getByText("About")).toBeInTheDocument();
    expect(screen.getByText(/Computer Science/)).toBeInTheDocument();
    expect(screen.getByText(/Batch of 2019/)).toBeInTheDocument();
  });
});
