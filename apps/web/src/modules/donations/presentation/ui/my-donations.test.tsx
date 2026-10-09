import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = { refresh: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { render, screen } from "../../../../../tests/support/test-utils";
import type { Donation } from "../../domain/donation";
import { MyDonations } from "./my-donations";
import { PledgeForm } from "./pledge-form";

const donation = (over: Partial<Donation> = {}): Donation => ({
  id: "d1",
  campaignId: "c1",
  campaignTitle: "Library fund",
  donorId: "u1",
  amountPaise: 200000,
  paymentReference: null,
  status: "PLEDGED",
  decidedAt: null,
  note: null,
  createdAt: new Date("2026-10-01T00:00:00Z"),
  ...over,
});
const ok = () => vi.fn(async () => ({ ok: true as const, data: {} }));
const refused = (message: string) =>
  vi.fn(async () => ({
    ok: false as const,
    error: { code: "X", message },
    requestId: "q",
  }));

beforeEach(() => {
  router.refresh.mockReset();
  router.push.mockReset();
});

describe("MyDonations", () => {
  it("points to open campaigns when the member has not pledged", () => {
    render(<MyDonations donations={[]} setReference={ok()} cancel={ok()} />);
    expect(
      screen.getByRole("link", { name: "See open campaigns" })
    ).toHaveAttribute("href", "/donate");
  });

  it("shows each pledge's state and why one was not received", () => {
    render(
      <MyDonations
        donations={[
          donation({ id: "a", status: "CONFIRMED", paymentReference: "UTR1" }),
          donation({ id: "b", status: "NOT_RECEIVED", note: "DUPLICATE" }),
          donation({ id: "c", status: "NOT_RECEIVED", note: "made-up" }),
        ]}
        setReference={ok()}
        cancel={ok()}
      />
    );
    expect(screen.getByText(/Ref UTR1/)).toBeInTheDocument();
    expect(screen.getByText("Duplicate pledge")).toBeInTheDocument();
    // An unknown reason code falls back to the plain status, beside the two status badges.
    expect(screen.getAllByText("Not received")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "Cancel pledge" })).toBeNull();
  });

  it("saves a reference and cancels an open pledge, refreshing after each", async () => {
    const setReference = ok();
    const cancel = ok();
    render(
      <MyDonations
        donations={[donation()]}
        setReference={setReference}
        cancel={cancel}
      />
    );
    const save = screen.getByRole("button", { name: "Save reference" });
    expect(save).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Payment reference"), "UTR9");
    await userEvent.click(save);
    expect(setReference).toHaveBeenCalledWith("d1", "UTR9");
    await userEvent.click(
      screen.getByRole("button", { name: "Cancel pledge" })
    );
    expect(cancel).toHaveBeenCalledWith("d1");
    expect(router.refresh).toHaveBeenCalledTimes(2);
  });

  it("shows a refusal", async () => {
    render(
      <MyDonations
        donations={[donation()]}
        setReference={ok()}
        cancel={refused("Already decided.")}
      />
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Cancel pledge" })
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Already decided."
    );
    expect(router.refresh).not.toHaveBeenCalled();
  });
});

describe("PledgeForm", () => {
  it("records the pledge and goes to the member's donations", async () => {
    const action = vi.fn(async () => ({
      ok: true as const,
      data: { donationId: "d1" },
    }));
    render(<PledgeForm campaignId="c1" action={action} />);
    await userEvent.type(screen.getByLabelText("Amount (₹)"), "2,000");
    await userEvent.type(
      screen.getByLabelText("Payment reference (optional)"),
      "UTR1"
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Record my pledge" })
    );
    expect(action).toHaveBeenCalledWith("c1", {
      amount: "2,000",
      paymentReference: "UTR1",
    });
    expect(router.push).toHaveBeenCalledWith("/donations?pledged=1");
  });

  it("shows the field message of a refused pledge", async () => {
    const action = vi.fn(async () => ({
      ok: false as const,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid",
        fields: { amount: "Too small." },
      },
      requestId: "q",
    }));
    render(<PledgeForm campaignId="c1" action={action} />);
    await userEvent.type(screen.getByLabelText("Amount (₹)"), "1");
    await userEvent.click(
      screen.getByRole("button", { name: "Record my pledge" })
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Too small.");
    expect(router.push).not.toHaveBeenCalled();
  });
});
