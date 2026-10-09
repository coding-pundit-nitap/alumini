import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CampaignProgressBar } from "./campaign-progress";

describe("CampaignProgressBar", () => {
  it("shows received money towards a goal, capped at 100%, with donors and open pledges", () => {
    render(
      <CampaignProgressBar
        progress={{ raisedPaise: 300000, pledgedPaise: 50000, donors: 3 }}
        goalPaise={200000}
      />
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "100"
    );
    expect(screen.getByText(/from 3 donors/)).toBeInTheDocument();
    expect(
      screen.getByText(/pledged and awaiting confirmation/)
    ).toBeInTheDocument();
  });

  it("names a single donor, and shows no bar without a goal or pledges without any", () => {
    const { unmount } = render(
      <CampaignProgressBar
        progress={{ raisedPaise: 1000, pledgedPaise: 0, donors: 1 }}
        goalPaise={null}
      />
    );
    expect(screen.getByText(/from 1 donor$/)).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText(/awaiting confirmation/)).toBeNull();
    unmount();
    render(
      <CampaignProgressBar
        progress={{ raisedPaise: 0, pledgedPaise: 0, donors: 0 }}
        goalPaise={0}
      />
    );
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText(/donor/)).toBeNull();
  });
});
