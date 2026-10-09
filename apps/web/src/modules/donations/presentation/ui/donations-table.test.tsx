import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import {
  render,
  screen,
  within,
} from "../../../../../tests/support/test-utils";
import type { DonationWithDonor } from "../../domain/donation";
import { DonationsTable } from "./donations-table";

const donation = (
  over: Partial<DonationWithDonor> = {}
): DonationWithDonor => ({
  id: "d1",
  campaignId: "c1",
  campaignTitle: "Library fund",
  donorId: "u1",
  amountPaise: 200000,
  paymentReference: "UTR123",
  status: "PLEDGED",
  decidedAt: null,
  note: null,
  createdAt: new Date("2026-10-01T00:00:00Z"),
  donor: { id: "u1", name: "Asha", email: "asha@example.test" },
  ...over,
});
const ok = () => vi.fn(async () => ({ ok: true as const, data: {} }));

describe("DonationsTable", () => {
  it("says when there is nothing to show", () => {
    render(
      <DonationsTable rows={[]} canDecide confirm={ok()} notReceived={ok()} />
    );
    expect(screen.getByText("Nothing here.")).toBeInTheDocument();
  });

  it("offers decisions only on open pledges, and only to someone who may decide", () => {
    const { unmount } = render(
      <DonationsTable
        rows={[
          donation(),
          donation({ id: "d2", status: "CONFIRMED", paymentReference: null }),
        ]}
        canDecide
        confirm={ok()}
        notReceived={ok()}
      />
    );
    expect(screen.getAllByRole("button", { name: "Confirm" })).toHaveLength(1);
    expect(screen.getByText("—")).toBeInTheDocument();
    unmount();
    render(
      <DonationsTable
        rows={[donation()]}
        canDecide={false}
        confirm={ok()}
        notReceived={ok()}
      />
    );
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
  });

  it("confirms against the reference, prefilled with the donor's and required", async () => {
    const confirm = ok();
    render(
      <DonationsTable
        rows={[donation()]}
        canDecide
        confirm={confirm}
        notReceived={ok()}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    const dialog = within(screen.getByRole("dialog"));
    const input = dialog.getByLabelText("Payment reference");
    expect(input).toHaveValue("UTR123");
    await userEvent.clear(input);
    expect(
      dialog.getByRole("button", { name: "Confirm received" })
    ).toBeDisabled();
    await userEvent.type(input, "UTR999");
    await userEvent.click(
      dialog.getByRole("button", { name: "Confirm received" })
    );
    expect(confirm).toHaveBeenCalledWith("d1", "UTR999");
  });

  it("marks a pledge not received with a chosen reason, and resets it on cancel", async () => {
    const notReceived = ok();
    render(
      <DonationsTable
        rows={[donation({ paymentReference: null })]}
        canDecide
        confirm={ok()}
        notReceived={notReceived}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Not received" }));
    let dialog = within(screen.getByRole("dialog"));
    const submit = dialog.getByRole("button", { name: "Mark not received" });
    expect(submit).toBeDisabled();
    await userEvent.selectOptions(dialog.getByLabelText("Reason"), "DUPLICATE");
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));

    await userEvent.click(screen.getByRole("button", { name: "Not received" }));
    dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByLabelText("Reason")).toHaveValue("");
    await userEvent.selectOptions(dialog.getByLabelText("Reason"), "DUPLICATE");
    await userEvent.click(
      dialog.getByRole("button", { name: "Mark not received" })
    );
    expect(notReceived).toHaveBeenCalledWith("d1", "DUPLICATE");
  });

  it("starts the confirm reference empty when the donor gave none", async () => {
    render(
      <DonationsTable
        rows={[donation({ paymentReference: null })]}
        canDecide
        confirm={ok()}
        notReceived={ok()}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(
      within(screen.getByRole("dialog")).getByLabelText("Payment reference")
    ).toHaveValue("");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  });
});
