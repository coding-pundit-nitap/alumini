import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import {
  render,
  screen,
  within,
} from "../../../../../tests/support/test-utils";
import type { CampaignWithProgress } from "../../domain/donation";
import { CampaignDialog } from "./campaign-dialog";
import { CampaignsTable } from "./campaigns-table";

const campaign = (
  over: Partial<CampaignWithProgress> = {}
): CampaignWithProgress => ({
  id: "c1",
  title: "Library fund",
  description: "Books",
  purpose: "New books",
  paymentInstructions: "UPI lib@bank",
  goalPaise: 500000,
  startsOn: "2026-10-01",
  endsOn: "2026-12-31",
  status: "DRAFT",
  createdAt: new Date("2026-09-01T00:00:00Z"),
  raisedPaise: 100000,
  pledgedPaise: 20000,
  donors: 2,
  ...over,
});

const ok = vi.fn(async () => ({ ok: true as const, data: {} }));

beforeEach(() => {
  refresh.mockReset();
  ok.mockClear();
});

describe("CampaignsTable", () => {
  it("says when there are no campaigns", () => {
    render(<CampaignsTable campaigns={[]} save={ok} changeStatus={ok} />);
    expect(screen.getByText("No campaigns yet.")).toBeInTheDocument();
  });

  it("offers each state's actions: edit and activate a draft, close an active one, nothing for a closed one", () => {
    render(
      <CampaignsTable
        campaigns={[
          campaign(),
          campaign({
            id: "c2",
            title: "Hostel",
            status: "ACTIVE",
            goalPaise: null,
          }),
          campaign({ id: "c3", title: "Old", status: "CLOSED" }),
        ]}
        save={ok}
        changeStatus={ok}
      />
    );
    const row = (name: string) =>
      within(
        screen.getByRole("rowheader", { name: new RegExp(name) }).closest("tr")!
      );
    expect(
      row("Library").getByRole("button", { name: "Edit" })
    ).toBeInTheDocument();
    expect(
      row("Library").getByRole("button", { name: "Activate" })
    ).toBeInTheDocument();
    expect(row("Library").getByText(/^of /)).toBeInTheDocument();
    expect(
      row("Hostel").getByRole("button", { name: "Close" })
    ).toBeInTheDocument();
    expect(row("Hostel").queryByText(/^of /)).toBeNull();
    expect(row("Old").queryAllByRole("button")).toHaveLength(0);
  });

  it("activates a draft after confirmation, then refreshes", async () => {
    const changeStatus = vi.fn(async () => ({ ok: true as const, data: {} }));
    render(
      <CampaignsTable
        campaigns={[campaign()]}
        save={ok}
        changeStatus={changeStatus}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Activate" }));
    expect(
      screen.getByText(
        "Members can pledge from its start date until its end date."
      )
    ).toBeInTheDocument();
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Activate",
      })
    );
    expect(changeStatus).toHaveBeenCalledWith("c1", "ACTIVE");
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps the dialog open with the first field message, else the safe message", async () => {
    const changeStatus = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code: "V",
          message: "Invalid",
          fields: { endsOn: "Ends too soon." },
        },
        requestId: "q",
      })
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "X", message: "Not now." },
        requestId: "q",
      });
    render(
      <CampaignsTable
        campaigns={[campaign({ status: "ACTIVE" })]}
        save={ok}
        changeStatus={changeStatus}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    const submit = within(screen.getByRole("dialog")).getByRole("button", {
      name: "Close campaign",
    });
    await userEvent.click(submit);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ends too soon."
    );
    await userEvent.click(submit);
    expect(await screen.findByRole("alert")).toHaveTextContent("Not now.");
    expect(changeStatus).toHaveBeenCalledWith("c1", "CLOSED");
    expect(refresh).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("CampaignDialog", () => {
  it("creates a draft from the typed fields", async () => {
    const save = vi.fn(async () => ({ ok: true as const, data: {} }));
    render(<CampaignDialog action={save} />);
    await userEvent.click(screen.getByRole("button", { name: "New campaign" }));
    expect(
      screen.getByText(
        "Starts as a draft. Members see it once you activate it."
      )
    ).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Title"), "Lab");
    await userEvent.type(screen.getByLabelText("Purpose"), "Kits");
    await userEvent.type(screen.getByLabelText("Description"), "For the lab");
    await userEvent.type(
      screen.getByLabelText("Payment instructions"),
      "UPI x"
    );
    await userEvent.type(screen.getByLabelText("Goal (₹, optional)"), "1000");
    await userEvent.type(screen.getByLabelText("Starts on"), "2026-11-01");
    await userEvent.type(screen.getByLabelText("Ends on"), "2026-11-30");
    await userEvent.click(screen.getByRole("button", { name: "Create draft" }));
    expect(save).toHaveBeenCalledWith(null, {
      title: "Lab",
      purpose: "Kits",
      description: "For the lab",
      paymentInstructions: "UPI x",
      goal: "1000",
      startsOn: "2026-11-01",
      endsOn: "2026-11-30",
    });
  });

  it("edits an existing campaign, and resets unsaved changes on cancel", async () => {
    const save = vi.fn(async () => ({ ok: true as const, data: {} }));
    render(
      <CampaignDialog campaign={campaign({ goalPaise: null })} action={save} />
    );
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const title = screen.getByLabelText("Title");
    expect(title).toHaveValue("Library fund");
    expect(screen.getByLabelText("Goal (₹, optional)")).toHaveValue("");
    await userEvent.type(title, " 2");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Title")).toHaveValue("Library fund");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(save).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ goal: "" })
    );
  });
});
